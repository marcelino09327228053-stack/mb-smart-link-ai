package com.example.mbknowledgehub

import java.net.URI

object ServerSettings {
    const val PRODUCTION = "https://mb-smart-link-ai.onrender.com"
    const val READ_TIMEOUT_MS = 90000
    fun isLocal(value: String): Boolean = try { URI(value).host in listOf("127.0.0.1", "localhost") } catch (_: Exception) { false }
    fun initial(saved: String?, explicitLocal: Boolean): String =
        if (saved.isNullOrBlank() || (isLocal(saved) && !explicitLocal)) PRODUCTION else saved
    fun normalize(value: String): String {
        val uri = URI(value.trim())
        require(uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null &&
            (uri.path.isNullOrEmpty() || uri.path == "/") &&
            (uri.scheme == "https" || (uri.scheme == "http" && isLocal(value.trim())))) {
            "Use an HTTPS website address, or localhost for development."
        }
        return URI(uri.scheme.lowercase(), null, uri.host.lowercase(), uri.port, null, null, null).toString()
    }
    fun retryable(status: Int) = status in listOf(502, 503, 504)
}
