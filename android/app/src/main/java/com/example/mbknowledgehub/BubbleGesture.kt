package com.example.mbknowledgehub

import kotlin.math.hypot

/** Drag cancels both actions; a completed long press can never become a tap. */
class BubbleGesture(private val slop: Float) {
    companion object { const val HOLD_MS = 500L }
    private var x=0f
    private var y=0f
    private var started=0L
    private var down=false
    private var held=false
    var dragged=false
        private set
    fun start(x: Float,y: Float,now: Long){this.x=x;this.y=y;started=now;down=true;held=false;dragged=false}
    fun move(x: Float,y: Float): Boolean {
        if(down&&hypot(x-this.x,y-this.y)>slop)dragged=true
        return dragged
    }
    fun longPress(now: Long): Boolean {
        if(!down||dragged||held||now-started<HOLD_MS)return false
        held=true;return true
    }
    fun finish(): Boolean {val tap=down&&!dragged&&!held;down=false;return tap}
    fun cancel(){down=false}
}
