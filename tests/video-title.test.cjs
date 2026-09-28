const {test}=require('node:test');
const assert=require('node:assert/strict');
const {videoTitle}=require('../server/video-title.cjs');
test('YouTube Shorts and playlist links use a clean video URL for title lookup',async()=>{
 for(const url of ['https://www.youtube.com/shorts/jfKfPfyJRdk','https://youtu.be/jfKfPfyJRdk?si=test','https://www.youtube.com/watch?v=jfKfPfyJRdk&list=test']){
 const title=await videoTitle(url,async endpoint=>{assert.equal(new URL(endpoint).searchParams.get('url'),'https://www.youtube.com/watch?v=jfKfPfyJRdk');return JSON.stringify({title:'Actual video title'})});assert.equal(title,'Actual video title');
 }
});
test('public page metadata is used when oEmbed does not provide a title',async()=>{
 assert.equal(await videoTitle('https://www.tiktok.com/@test/video/123',async url=>{if(url.includes('oembed'))throw Error();return '<meta property="og:title" content="Video &amp; caption">'}),'Video & caption');
});
test('blocked or inaccessible videos use Untitled Video instead of a URL',async()=>{
 assert.equal(await videoTitle('https://www.facebook.com/reel/123',async()=>{throw Error()}),'Untitled Video');
 assert.equal(await videoTitle('https://www.facebook.com/reel/123',async()=>'<title>Log in to Facebook</title>'),'Untitled Video');
});
