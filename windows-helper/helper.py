"""Local WASAPI loopback bridge. No microphone, file recording, or API secrets."""
import argparse
import asyncio
import contextlib
import json
import queue
import sys
from http import HTTPStatus

from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed


class Loopback:
    def __init__(self):
        self.audio = None
        self.stream = None
        self.frames = queue.Queue(maxsize=10)  # ~200ms; drop stale data, never accumulate lag.

    def open(self):
        import pyaudiowpatch as pa
        try:
            self.audio = pa.PyAudio()
            device = self.audio.get_default_wasapi_loopback()
            if not device.get("isLoopbackDevice"):
                raise RuntimeError("Default Windows output has no WASAPI loopback device.")
            self.rate = int(device["defaultSampleRate"])
            self.channels = int(device["maxInputChannels"])
            if not (8000 <= self.rate <= 192000 and 1 <= self.channels <= 32):
                raise RuntimeError("Unsupported system audio format.")

            def callback(data, frame_count, time_info, flags):
                try:
                    self.frames.put_nowait(data)
                except queue.Full:
                    with contextlib.suppress(queue.Empty):
                        self.frames.get_nowait()
                    with contextlib.suppress(queue.Full):
                        self.frames.put_nowait(data)
                return (None, pa.paContinue)

            self.stream = self.audio.open(
                format=pa.paInt16, channels=self.channels, rate=self.rate,
                input=True, input_device_index=device["index"],
                frames_per_buffer=max(128, self.rate // 50),
                stream_callback=callback, start=False,
            )
            return {"type": "started", "format": "s16le", "rate": self.rate, "channels": self.channels}
        except Exception:
            self.close()
            raise

    def start(self):
        self.stream.start_stream()

    def read(self):
        try:
            return self.frames.get(timeout=0.25)
        except queue.Empty:
            if self.stream is None or not self.stream.is_active():
                raise RuntimeError("Windows audio device disconnected.")
            return None  # WASAPI can produce no packets while the output is silent.

    def close(self):
        try:
            if self.stream is not None:
                stream, self.stream = self.stream, None
                try:
                    if stream.is_active():
                        stream.stop_stream()
                finally:
                    stream.close()
        finally:
            if self.audio is not None:
                audio, self.audio = self.audio, None
                audio.terminate()


class AudioHelper:
    def __init__(self, origins, port, capture_factory=Loopback):
        self.origins = set(origins)
        self.port = port
        self.capture_factory = capture_factory
        self.owner = None
        self.capture = None

    def process_request(self, connection, request):
        if request.headers.get("Host") not in {f"127.0.0.1:{self.port}", f"localhost:{self.port}"}:
            return connection.respond(HTTPStatus.FORBIDDEN, "Local host required.\n")
        if request.path == "/health" and request.headers.get("Upgrade", "").lower() != "websocket":
            result = connection.respond(HTTPStatus.OK, json.dumps({
                "service": "knowledge-hub-wasapi", "version": 1, "capturing": self.capture is not None
            }))
            result.headers["Content-Type"] = "application/json"
            result.headers["Cache-Control"] = "no-store"
            return result
        if request.path != "/audio" or request.headers.get("Origin") not in self.origins:
            return connection.respond(HTTPStatus.FORBIDDEN, "Knowledge Hub origin required.\n")
        return None

    async def handler(self, ws):
        sender = None
        capture = None

        async def stop():
            nonlocal sender, capture
            if sender is not None:
                sender.cancel()
                with contextlib.suppress(asyncio.CancelledError, ConnectionClosed):
                    await sender
                sender = None
            if capture is not None:
                closing, capture = capture, None
                try:
                    await asyncio.to_thread(closing.close)
                finally:
                    if self.owner is ws:
                        self.capture = None
                        self.owner = None

        async def pump(source):
            try:
                while True:
                    data = await asyncio.to_thread(source.read)
                    if data:
                        await asyncio.wait_for(ws.send(data), timeout=2)
            except asyncio.CancelledError:
                raise
            except Exception:
                with contextlib.suppress(ConnectionClosed):
                    await ws.send(json.dumps({"type": "error", "message": "Windows audio capture disconnected."}))
                await ws.close(code=1011, reason="Capture disconnected")

        try:
            await ws.send(json.dumps({"type": "hello", "version": 1}))
            async for message in ws:
                try:
                    command = json.loads(message) if isinstance(message, str) else {}
                except ValueError:
                    command = {}
                if not isinstance(command, dict):
                    command = {}
                if command.get("type") == "start":
                    if capture is not None:
                        continue  # Idempotent: one audio stream per client.
                    if self.owner is not None:
                        await ws.send(json.dumps({"type": "error", "message": "Helper is in use by another Knowledge Hub tab."}))
                        continue
                    self.owner = ws  # Reserve before awaiting device initialization.
                    capture = self.capture_factory()
                    self.capture = capture
                    try:
                        info = await asyncio.to_thread(capture.open)
                        await ws.send(json.dumps(info))
                        await asyncio.to_thread(capture.start)
                        sender = asyncio.create_task(pump(capture))
                    except Exception:
                        await stop()
                        await ws.send(json.dumps({"type": "error", "message": "WASAPI output unavailable. Check your Windows playback device."}))
                elif command.get("type") == "stop":
                    await stop()
                    await ws.send(json.dumps({"type": "stopped"}))
                else:
                    await ws.send(json.dumps({"type": "error", "message": "Unknown helper command."}))
        except ConnectionClosed:
            pass
        finally:
            await stop()


async def run(args):
    helper = AudioHelper(args.origin, args.port)
    async with serve(helper.handler, "127.0.0.1", args.port,
                     process_request=helper.process_request, max_size=1024,
                     compression=None, ping_interval=5, ping_timeout=5,
                     close_timeout=1, max_queue=4, write_limit=32768):
        print(f"Windows Audio Helper ready on 127.0.0.1:{args.port}; idle until START.", flush=True)
        await asyncio.Future()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5502)
    parser.add_argument("--origin", action="append", default=[])
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Port must be between 1024 and 65535.")
    if not args.origin:
        args.origin = ["http://127.0.0.1:5500", "http://localhost:5500"]
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        pass
    except OSError:
        print("Helper cannot bind its localhost port (another helper may already be running).", file=sys.stderr)
        sys.exit(1)
