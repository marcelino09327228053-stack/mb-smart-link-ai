package com.example.mbknowledgehub
import org.junit.Assert.*
import org.junit.Test
class BubbleGestureTest {
 @Test fun tapSavesOnce(){val g=BubbleGesture(8f);g.start(0f,0f,0);assertTrue(g.finish());assertFalse(g.finish())}
 @Test fun holdOpensAt500MillisecondsAndNeverSaves(){val g=BubbleGesture(8f);g.start(0f,0f,10);assertFalse(g.longPress(509));assertTrue(g.longPress(510));assertFalse(g.longPress(3010));assertFalse(g.finish())}
 @Test fun draggingCancelsBothActions(){val g=BubbleGesture(8f);g.start(0f,0f,0);assertTrue(g.move(20f,0f));assertFalse(g.longPress(2500));assertFalse(g.finish())}
 @Test fun smallMovementStillAllowsTap(){val g=BubbleGesture(8f);g.start(0f,0f,0);assertFalse(g.move(2f,2f));assertTrue(g.finish())}
 @Test fun cancelledTouchDoesNothing(){val g=BubbleGesture(8f);g.start(0f,0f,0);g.cancel();assertFalse(g.longPress(3000));assertFalse(g.finish())}
}
