package com.example.mbknowledgehub

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.io.IOException

object ServerConnection {
    fun base(context: Context): String {
        val prefs=context.getSharedPreferences("mb_connection",0)
        val result=ServerSettings.initial(prefs.getString("base",null),prefs.getBoolean("explicitLocalDevelopment",false))
        if(result!=prefs.getString("base",null))prefs.edit().putString("base",result).apply()
        return result
    }
    fun configure(context: Context,value: String) {
        val origin=ServerSettings.normalize(value)
        context.getSharedPreferences("mb_connection",0).edit().putString("base",origin)
            .putBoolean("explicitLocalDevelopment",ServerSettings.isLocal(origin)).apply()
    }
    fun save(base: String,cookie: String,url: String,requestId: String): JSONObject {
        // Retry the same operation ID: a lost response must not create a second item.
        val payload=JSONObject().put("url",url).put("requestId",requestId).toString()
        for(attempt in 0..1){
            val connection=URL("$base/api/library/capture").openConnection() as HttpURLConnection
            try {
                connection.requestMethod="POST";connection.instanceFollowRedirects=false
                connection.connectTimeout=15000;connection.readTimeout=ServerSettings.READ_TIMEOUT_MS
                connection.setRequestProperty("Content-Type","application/json")
                connection.setRequestProperty("Origin",base)
                connection.setRequestProperty("Cookie",cookie)
                connection.doOutput=true
                connection.outputStream.use{it.write(payload.toByteArray(Charsets.UTF_8))}
                val code=connection.responseCode
                if(ServerSettings.retryable(code)){
                    if(attempt==0)continue
                    throw IllegalStateException("Server is waking up or temporarily unavailable. Try again shortly.")
                }
                val stream=if(code in 200..299)connection.inputStream else connection.errorStream
                val result=try { stream?.bufferedReader()?.use{JSONObject(it.readText())} ?: JSONObject() } catch(_:Exception){JSONObject()}
                if(code !in 200..299 || !result.optBoolean("saved"))
                    throw IllegalStateException(result.optString("error","Link was not saved. Open MB Smart Link to check your login and category."))
                return result
            } catch(e:IOException) {
                if(attempt==1)throw IllegalStateException("Could not confirm the save. Check your connection and library before trying again.")
            } finally {connection.disconnect()}
        }
        throw IllegalStateException("Could not confirm the save.")
    }
}
