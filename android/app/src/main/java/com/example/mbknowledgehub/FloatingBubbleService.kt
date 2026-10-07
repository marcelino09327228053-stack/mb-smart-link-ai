package com.example.mbknowledgehub

import android.app.*
import android.content.*
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.*
import android.provider.Settings
import android.view.*
import android.widget.TextView
import android.widget.Toast
import android.webkit.CookieManager
import androidx.core.app.NotificationCompat
import java.net.URI
import java.util.UUID
import java.util.concurrent.Executors

class FloatingBubbleService : Service() {
    companion object { @Volatile var isRunning=false; private set }
    private lateinit var manager: WindowManager
    private lateinit var bubble: TextView
    private lateinit var params: WindowManager.LayoutParams
    private val handler=Handler(Looper.getMainLooper())
    private val worker=Executors.newSingleThreadExecutor()
    private var attached=false
    private var busy=false
    private var awaitingClipboard=false
    private var downX=0f; private var downY=0f
    private var originalX=0; private var originalY=0
    private lateinit var gesture: BubbleGesture
    private val openApp=Runnable {
        if(attached&&gesture.longPress(SystemClock.uptimeMillis())){
            startActivity(Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        }
    }
    private val focusTimeout=Runnable {
        if(awaitingClipboard){releaseFocus();busy=false;error("Android did not allow clipboard access. Copy the URL again and tap MB.")}
    }
    override fun onBind(intent: Intent?)=null
    override fun onCreate() {
        super.onCreate()
        manager=getSystemService(WINDOW_SERVICE) as WindowManager
        gesture=BubbleGesture(ViewConfiguration.get(this).scaledTouchSlop.toFloat())
        val channel="mb_capture"
        if(Build.VERSION.SDK_INT>=26)(getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(NotificationChannel(channel,"MB floating button",NotificationManager.IMPORTANCE_LOW))
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop=PendingIntent.getService(this,1,Intent(this,FloatingBubbleService::class.java).setAction("STOP"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        startForeground(1001,NotificationCompat.Builder(this,channel).setSmallIcon(android.R.drawable.ic_menu_save)
            .setContentTitle("MB Smart Link").setContentText("Tap MB to save • Hold 0.5 seconds to open")
            .setContentIntent(open).addAction(0,"Stop MB",stop).setOngoing(true).build())
        if(!Settings.canDrawOverlays(this)){stopSelf();return}
        val prefs=getSharedPreferences("mb_bubble_position",0)
        params=WindowManager.LayoutParams(dp(60),dp(60),
            if(Build.VERSION.SDK_INT>=26)WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT).apply {gravity=Gravity.TOP or Gravity.LEFT;x=prefs.getInt("x",dp(16));y=prefs.getInt("y",dp(120));softInputMode=WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN}
        bubble=object:androidx.appcompat.widget.AppCompatTextView(android.view.ContextThemeWrapper(this,R.style.Theme_MBKnowledgeHub)){
            override fun onWindowFocusChanged(hasFocus: Boolean){
                super.onWindowFocusChanged(hasFocus)
                if(hasFocus&&awaitingClipboard)handler.post{readClipboard()}
            }
            override fun performClick(): Boolean {super.performClick();return true}
        }.apply {
            text="MB";textSize=17f;setTextColor(Color.WHITE);typeface=Typeface.DEFAULT_BOLD;gravity=Gravity.CENTER
            contentDescription="MB. Tap to save copied link. Hold 0.5 seconds to open."
            background=GradientDrawable().apply{shape=GradientDrawable.OVAL;setColor(Color.rgb(9,77,159));setStroke(dp(2),Color.rgb(77,173,255))}
            alpha=.78f;isFocusableInTouchMode=true
        }
        bubble.setOnTouchListener {_,event->
            when(event.actionMasked){
                MotionEvent.ACTION_DOWN->{downX=event.rawX;downY=event.rawY;originalX=params.x;originalY=params.y;gesture.start(event.rawX,event.rawY,SystemClock.uptimeMillis());bubble.alpha=1f;handler.postDelayed(openApp,BubbleGesture.HOLD_MS);true}
                MotionEvent.ACTION_MOVE->{
                    val dx=event.rawX-downX;val dy=event.rawY-downY
                    if(gesture.move(event.rawX,event.rawY))handler.removeCallbacks(openApp)
                    if(gesture.dragged){params.x=originalX+dx.toInt();params.y=originalY+dy.toInt();clamp();update()}
                    true
                }
                MotionEvent.ACTION_UP->{
                    handler.removeCallbacks(openApp);bubble.alpha=.78f
                    if(gesture.dragged)getSharedPreferences("mb_bubble_position",0).edit().putInt("x",params.x).putInt("y",params.y).apply()
                    if(gesture.finish()){bubble.performClick();beginSave()}
                    true
                }
                MotionEvent.ACTION_CANCEL->{gesture.cancel();handler.removeCallbacks(openApp);bubble.alpha=.78f;true}
                else->true
            }
        }
        try{clamp();manager.addView(bubble,params);attached=true;isRunning=true}catch(_:Exception){stopSelf()}
    }
    private fun beginSave(){
        if(busy||!attached)return
        busy=true;awaitingClipboard=true
        // Android 10+ allows clipboard reads only while this app has focus.
        // Only the user's explicit tap makes the small bubble focusable.
        params.flags=params.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
        update();bubble.requestFocus()
        if(bubble.hasWindowFocus())handler.post{readClipboard()}
        handler.postDelayed(focusTimeout,1200)
    }
    private fun readClipboard(){
        if(!awaitingClipboard||!attached)return
        try{
            val clipboard=getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
            val text=clipboard.primaryClip?.takeIf{it.itemCount>0}?.getItemAt(0)?.text?.toString()?.trim().orEmpty()
            releaseFocus()
            val uri=URI(text)
            require(text.length<=4096&&uri.scheme?.lowercase() in listOf("https","http")&&uri.host?.contains(".")==true&&uri.userInfo==null){"Copy a valid URL first."}
            val base=ServerConnection.base(this)
            val cookie=CookieManager.getInstance().getCookie(base).orEmpty()
            require(cookie.contains("mb_session=")){"Hold MB to open the app and sign in first."}
            val requestId=UUID.randomUUID().toString()
            worker.execute{
                try{
                    ServerConnection.save(base,cookie,text,requestId)
                    handler.post{
                        if(attached){bubble.text="SAVE";handler.postDelayed({if(attached)bubble.text="MB";busy=false},1000)}
                    }
                }catch(e:Exception){handler.post{busy=false;if(attached)error(e.message?:"Unable to save. Check the connection.")}}
            }
        }catch(e:Exception){releaseFocus();busy=false;error(e.message?:"Copy a URL first.")}
    }
    private fun releaseFocus(){
        awaitingClipboard=false;handler.removeCallbacks(focusTimeout)
        params.flags=params.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        update()
    }
    private fun error(message:String){Toast.makeText(this,message,Toast.LENGTH_LONG).show()}
    private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
    private fun clamp(){
        val metrics=resources.displayMetrics
        params.x=params.x.coerceIn(0,(metrics.widthPixels-dp(60)).coerceAtLeast(0))
        params.y=params.y.coerceIn(0,(metrics.heightPixels-dp(100)).coerceAtLeast(0))
    }
    private fun update(){if(attached)try{manager.updateViewLayout(bubble,params)}catch(_:Exception){stopSelf()}}
    override fun onConfigurationChanged(config:android.content.res.Configuration){super.onConfigurationChanged(config);clamp();update()}
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {if(intent?.action=="STOP")stopSelf();return START_NOT_STICKY}
    override fun onDestroy(){
        isRunning=false
        handler.removeCallbacksAndMessages(null);awaitingClipboard=false
        if(attached){attached=false;try{manager.removeView(bubble)}catch(_:Exception){}}
        worker.shutdownNow();super.onDestroy()
    }
}
