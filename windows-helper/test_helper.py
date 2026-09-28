import asyncio
import json
import time
import unittest
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from websockets.exceptions import InvalidStatus
from helper import AudioHelper


class FakeCapture:
    instances = []

    def __init__(self):
        self.closed = False
        self.running = False
        self.instances.append(self)

    def open(self):
        return {"type": "started", "format": "s16le", "rate": 48000, "channels": 2}

    def start(self):
        self.running = True

    def read(self):
        time.sleep(0.01)
        return b"\x00" * 3840

    def close(self):
        self.closed = True
        self.running = False


async def next_json(ws):
    while True:
        message = await asyncio.wait_for(ws.recv(), 2)
        if isinstance(message, str):
            return json.loads(message)


class HelperTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        FakeCapture.instances = []
        self.origin = "http://127.0.0.1:5500"
        self.helper = AudioHelper([self.origin], 0, FakeCapture)
        self.server = await serve(self.helper.handler, "127.0.0.1", 0,
                                  process_request=self.helper.process_request, close_timeout=1)
        self.helper.port = self.server.sockets[0].getsockname()[1]
        self.url = f"ws://127.0.0.1:{self.helper.port}/audio"

    async def asyncTearDown(self):
        self.server.close()
        await self.server.wait_closed()

    async def test_idle_start_stop_and_idempotent_start(self):
        async with connect(self.url, origin=self.origin) as ws:
            self.assertEqual((await next_json(ws))["type"], "hello")
            self.assertIsNone(self.helper.capture)
            await ws.send('{"type":"start"}')
            self.assertEqual((await next_json(ws))["type"], "started")
            self.assertIsInstance(await ws.recv(), bytes)
            await ws.send('{"type":"start"}')
            await ws.send('{"type":"stop"}')
            self.assertEqual((await next_json(ws))["type"], "stopped")
            self.assertEqual(len(FakeCapture.instances), 1)
            self.assertTrue(FakeCapture.instances[0].closed)
            self.assertIsNone(self.helper.capture)

    async def test_only_one_owner_then_reconnect(self):
        async with connect(self.url, origin=self.origin) as first, connect(self.url, origin=self.origin) as second:
            await next_json(first)
            await next_json(second)
            await first.send('{"type":"start"}')
            await next_json(first)
            await second.send('{"type":"start"}')
            self.assertIn("in use", (await next_json(second))["message"])
            await first.send('{"type":"stop"}')
            await next_json(first)
            await second.send('{"type":"start"}')
            self.assertEqual((await next_json(second))["type"], "started")
        await asyncio.sleep(0.05)
        self.assertTrue(all(c.closed for c in FakeCapture.instances))

    async def test_browser_refresh_closes_capture(self):
        ws = await connect(self.url, origin=self.origin)
        await next_json(ws)
        await ws.send('{"type":"start"}')
        await next_json(ws)
        await ws.close()
        for _ in range(20):
            if self.helper.capture is None:
                break
            await asyncio.sleep(0.02)
        self.assertIsNone(self.helper.capture)
        self.assertTrue(FakeCapture.instances[0].closed)

    async def test_foreign_or_missing_origin_cannot_capture(self):
        for origin in [None, "https://example.com"]:
            with self.assertRaises(InvalidStatus):
                async with connect(self.url, origin=origin):
                    pass
        self.assertEqual(len(FakeCapture.instances), 0)

    async def test_malformed_commands_do_not_start_capture(self):
        async with connect(self.url, origin=self.origin) as ws:
            await next_json(ws)
            for command in ['not-json', '[]', 'null', '{"type":"microphone"}']:
                await ws.send(command)
                self.assertEqual((await next_json(ws))["type"], "error")
        self.assertEqual(len(FakeCapture.instances), 0)

    async def test_device_failure_releases_owner(self):
        class Broken(FakeCapture):
            def open(self):
                raise RuntimeError("missing device")
        self.helper.capture_factory = Broken
        async with connect(self.url, origin=self.origin) as ws:
            await next_json(ws)
            await ws.send('{"type":"start"}')
            self.assertEqual((await next_json(ws))["type"], "error")
            self.assertIsNone(self.helper.owner)
            self.assertTrue(FakeCapture.instances[0].closed)


if __name__ == "__main__":
    unittest.main()
