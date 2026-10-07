package com.example.mbknowledgehub
import org.junit.Assert.*
import org.junit.Test
class ServerSettingsTest {
 @Test fun newInstallAndLegacyLocalUseRender(){
  assertEquals(ServerSettings.PRODUCTION,ServerSettings.initial(null,false))
  assertEquals(ServerSettings.PRODUCTION,ServerSettings.initial("http://127.0.0.1:5500",false))
 }
 @Test fun explicitDevelopmentAndCustomHttpsRemainAvailable(){
  assertEquals("http://localhost:5500",ServerSettings.initial("http://localhost:5500",true))
  assertEquals("https://example.com",ServerSettings.initial("https://example.com",false))
 }
 @Test fun originNormalizationMatchesCookieAndCsrfOrigin(){
  assertEquals(ServerSettings.PRODUCTION,ServerSettings.normalize(ServerSettings.PRODUCTION+"/"))
  assertEquals("https://example.com",ServerSettings.normalize("https://EXAMPLE.com/"))
 }
 @Test fun onlyTransientServerErrorsRetry(){
  assertTrue(ServerSettings.retryable(503));assertTrue(ServerSettings.retryable(502))
  assertFalse(ServerSettings.retryable(401));assertFalse(ServerSettings.retryable(400));assertFalse(ServerSettings.retryable(429))
  assertTrue(ServerSettings.READ_TIMEOUT_MS>=90000)
 }
 @Test(expected=IllegalArgumentException::class) fun rejectsInsecureRemote(){ServerSettings.normalize("http://example.com")}
 @Test(expected=IllegalArgumentException::class) fun rejectsEmbeddedCredentials(){ServerSettings.normalize("https://user:secret@example.com")}
}
