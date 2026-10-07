package com.example.mbknowledgehub

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.graphics.Color
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.widget.*
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private var microphoneRequest: android.webkit.PermissionRequest?=null
    private fun microphoneHelp(){
        if(isFinishing||isDestroyed)return
        androidx.appcompat.app.AlertDialog.Builder(this).setTitle("Microphone access needed")
            .setMessage("Allow microphone access to use AI Listen. Then tap LISTEN again.")
            .setPositiveButton("Retry"){_,_->requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),42)}
            .setNeutralButton("Open settings"){_,_->startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")))}
            .setNegativeButton("Cancel",null).show()
    }
    override fun onRequestPermissionsResult(code:Int,permissions:Array<out String>,results:IntArray){
        super.onRequestPermissionsResult(code,permissions,results)
        if(code!=42)return
        val request=microphoneRequest;microphoneRequest=null
        val allowed=checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED
        if(allowed){
            if(request!=null){if(trusted(request.origin.toString())&&trusted(web.url))request.grant(arrayOf(android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE))else request.deny()}
            else Toast.makeText(this,"Microphone allowed. Tap LISTEN again.",Toast.LENGTH_LONG).show()
        }else{request?.deny();microphoneHelp()}
    }
    private val stateHandler=android.os.Handler(android.os.Looper.getMainLooper())
    private var lastBubbleState=""
    private var awaitingOverlay=false
    private fun trusted(url:String?):Boolean {
        val uri=Uri.parse(url?:"");val origin=Uri.parse(ServerConnection.base(this))
        return uri.scheme==origin.scheme && uri.host==origin.host && uri.port==origin.port
    }
    private fun toggleBubble(){
        if(FloatingBubbleService.isRunning){stopService(Intent(this,FloatingBubbleService::class.java));return}
        if(!Settings.canDrawOverlays(this)){
            awaitingOverlay=true
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:$packageName")))
            Toast.makeText(this,"Allow display over other apps, then return here.",Toast.LENGTH_LONG).show()
            return
        }
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),21)
        try{ContextCompat.startForegroundService(this,Intent(this,FloatingBubbleService::class.java))}
        catch(e:Exception){Toast.makeText(this,"Unable to start Bubble: "+e.message,Toast.LENGTH_LONG).show()}
    }
    private val publishState=object:Runnable {override fun run(){
        if(::web.isInitialized){
            val state=FloatingBubbleService.isRunning

            if(trusted(web.url)&&lastBubbleState!=state.toString()){
                lastBubbleState=state.toString()
                web.evaluateJavascript("window.MBBubble={available:true,enabled:$state};window.dispatchEvent(new Event('mb-bubble-state'));",null)
            }
        }
        stateHandler.postDelayed(this,500)
    }}
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.rgb(5,17,34))}
        root.setOnApplyWindowInsetsListener { view,insets ->
            view.setPadding(insets.systemWindowInsetLeft,insets.systemWindowInsetTop,insets.systemWindowInsetRight,insets.systemWindowInsetBottom);insets
        }
        web=WebView(this)
        web.settings.javaScriptEnabled=true
        web.settings.domStorageEnabled=true
        web.webChromeClient=object:android.webkit.WebChromeClient(){
            override fun onConsoleMessage(message:android.webkit.ConsoleMessage):Boolean {
                val event=message.message().removePrefix("MB_AUTH:")
                if(trusted(web.url)&&message.message().startsWith("MB_AUTH:")&&event in setOf("SIGN_IN_PRESSED","AUTH_FLOW_OPENED","AUTH_SUCCESS","AUTH_FAILURE","SESSION_DETECTED","LISTEN_ALLOWED","LISTEN_BLOCKED","AUTH_CHECK_FAILED")){
                    android.util.Log.i("MBAuth",event)
                    if(event=="AUTH_SUCCESS"||event=="SESSION_DETECTED")CookieManager.getInstance().flush()
                    return true
                }
                return false
            }
            override fun onPermissionRequest(request:android.webkit.PermissionRequest){runOnUiThread {
                if(!trusted(request.origin.toString())||!trusted(web.url)||!request.resources.contains(android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE)){request.deny();return@runOnUiThread}
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED){request.grant(arrayOf(android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE))}
                else if(microphoneRequest==null){microphoneRequest=request;requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),42)}else request.deny()
            }}
            override fun onPermissionRequestCanceled(request:android.webkit.PermissionRequest){if(microphoneRequest===request)microphoneRequest=null}
        }
        web.settings.allowFileAccess=false
        web.settings.allowContentAccess=false
        web.settings.mixedContentMode=android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        CookieManager.getInstance().setAcceptCookie(true)
        web.webViewClient=object:WebViewClient(){
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri=request.url
                if(uri.scheme=="mb-bubble"){
                    if(request.isForMainFrame && request.hasGesture() && trusted(view.url) && uri.host=="toggle")toggleBubble()
                    return true
                }
                if(uri.scheme !in listOf("https","http"))return true
                val origin=Uri.parse(ServerConnection.base(this@MainActivity))
                if(uri.scheme==origin.scheme&&uri.host==origin.host&&uri.port==origin.port)return false
                try{startActivity(Intent(Intent.ACTION_VIEW,uri))}catch(_:Exception){}
                return true
            }
            override fun onPageStarted(view:WebView,url:String,favicon:android.graphics.Bitmap?){microphoneRequest?.deny();microphoneRequest=null}
            override fun onPageFinished(view: WebView,url: String){android.util.Log.i("MBAuth","PAGE_FINISHED trusted="+trusted(url)+" url="+url);CookieManager.getInstance().flush();lastBubbleState=""
                if(trusted(url)){web.evaluateJavascript(assets.open("listen-auth.js").bufferedReader().use{it.readText()},null);stateHandler.postDelayed({web.evaluateJavascript("(()= b=document.getElementById(''phoneListenToggle'');const f=b?.closest(''fieldset'');const s=document.getElementById(''phoneListenStatus'');return JSON.stringify({button:!!b,disabled:b?.disabled,gateDisabled:f?.disabled,status:s?.textContent,width:innerWidth})})()") { result -> android.util.Log.i("MBAuth","LISTEN_STATE="+result) }},2000)}
            }
        }
        // No JavaScript interface: external pages cannot call native save operations.
        root.addView(web,LinearLayout.LayoutParams(-1,0,1f));setContentView(root)
        if(savedInstanceState==null)web.loadUrl(ServerConnection.base(this)) else web.restoreState(savedInstanceState)
        onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){
            override fun handleOnBackPressed(){if(web.canGoBack())web.goBack()else moveTaskToBack(true)}
        })
    }
    override fun onResume(){super.onResume();lastBubbleState="";stateHandler.post(publishState)
        if(awaitingOverlay){awaitingOverlay=false;if(Settings.canDrawOverlays(this))toggleBubble()}
    }
    override fun onPause(){stateHandler.removeCallbacks(publishState);super.onPause()}
    override fun onSaveInstanceState(outState: Bundle){web.saveState(outState);super.onSaveInstanceState(outState)}
    override fun onDestroy(){microphoneRequest?.deny();microphoneRequest=null;stateHandler.removeCallbacksAndMessages(null);web.destroy();super.onDestroy()}
}



