# Canvas Debugging Guide for Fortu 44" Signage Display

## What Was Fixed

The canvas drawing feature wasn't working on Fortu 44" signage displays while working fine on laptops and phones. This was caused by:

1. **Canvas not initializing with correct dimensions** - When the container returns 0 width/height on startup
2. **ResizeObserver not triggering** - Old Android WebView in Xibo doesn't support ResizeObserver reliably
3. **Event listeners not receiving events** - Touch/pointer events may not be delivered properly

## How to Debug on Fortu

### Step 1: Open Developer Console
1. Press **F12** or **Right-click → Inspect** on the Fortu display screen
2. Go to the **Console** tab

### Step 2: Run Initial Diagnosis
Type this command to see the full debug report:

```javascript
canvasDebug.printReport()
```

This will output:
- ✅ Canvas element exists or ❌ not found
- Canvas dimensions (should be 1920×1080 for Fortu)
- Container display/visibility/opacity status
- 2D context creation status
- Supported event types (touch, pointer, mouse)
- **Any errors/warnings** detected

**Look for these critical issues:**
- `Canvas has zero dimensions` - Initialization failed
- `Canvas element not found` - DOM didn't render
- `No pointer event types supported` - Device can't receive input
- Container `display: none` or `visibility: hidden`

### Step 3: Test Event Delivery
If the report shows dimensions are correct but drawing still doesn't work, test if touch events are being delivered:

```javascript
canvasDebug.testEvents()
```

Then **try touching/clicking the canvas**. You'll see console logs like:
```
[TOUCHSTART] fired
[TOUCHMOVE] fired  
[TOUCHEND] fired
```

Or mouse events:
```
[MOUSEDOWN] fired
[MOUSEMOVE] fired
[MOUSEUP] fired
```

### Step 4: Check Event Counts
After testing events, see how many were recorded:

```javascript
canvasDebug.showEventCounts()
```

A table will show event counts. Example:
```
touchstart: 5
touchmove: 47
touchend: 3
mousedown: 0
mousemove: 0
mouseup: 0
pointerdown: 0
pointermove: 0
pointerup: 0
```

If all counts are 0, events are not reaching the canvas.

## Interpreting Results

### Case 1: Canvas Initializes Successfully
**Console shows:**
```
[Canvas] 2D context obtained
[Canvas] Initial init succeeded
[Canvas] Initialized: 1920x1080 @ 1x DPR
```

**Fix needed:** Check event delivery (Case 2)

### Case 2: Canvas Has Zero Dimensions
**Console shows:**
```
[Canvas] getBoundingClientRect returned 0 dims, skipping init
[Canvas] Timeout: forcing init with window dimensions
[Canvas] Initialized: 1920x1080 @ 1x DPR
```

✅ **This is expected on Fortu!** The 500ms timeout fallback kicks in and forces initialization.

**Drawing not working?** Check if events are being received (Step 3)

### Case 3: Context Creation Failed
**Console shows:**
```
[Canvas] Failed to get 2D context
```

**This is a serious issue.** The device doesn't support HTML5 Canvas 2D. This may be unfixable.

### Case 4: Events Not Reaching Canvas
**printReport() shows:**
- Canvas dimensions: ✅ Correct (1920×1080)
- 2D context: ✅ Exists
- No errors

**But:**
- testEvents() shows all counts at 0
- Drawing doesn't work when you touch/click

**Possible causes:**
1. Canvas has `pointer-events: none` (unlikely, code prevents this)
2. Another overlay element is blocking input
3. Xibo browser doesn't support the event type the OS sends

**What to check:**
```javascript
// Check if canvas has correct styles
let canvas = document.querySelector('canvas');
console.log('Canvas pointer-events:', window.getComputedStyle(canvas).pointerEvents);
console.log('Canvas display:', window.getComputedStyle(canvas).display);
console.log('Canvas position:', window.getComputedStyle(canvas).position);
```

All should be:
- `pointer-events: auto`
- `display: block`
- `position: relative` or `absolute`

## Common Issues & Solutions

### Drawing works on laptop but not Fortu

**Likely cause:** Fortu using old Android WebView

**Solution already applied:**
- Fallback canvas initialization (500ms timeout)
- Support for touch, pointer, AND mouse events
- Console logging to diagnose the issue

**Next steps:**
1. Run `canvasDebug.printReport()` on Fortu
2. Check if dimensions are correct
3. Run `canvasDebug.testEvents()` and touch canvas
4. Report results back to developer

### Event counts show zeros
**Diagnosis:** Xibo browser isn't delivering events to the canvas

**Possible fixes to try:**
1. Check if Xibo has a "touch input" setting - enable it
2. Restart Xibo/display
3. Try updating Xibo to latest version
4. Check Xibo logs for JavaScript errors

### Canvas dimensions are 0×0 and never initialize
**Diagnosis:** Container is not rendering properly

**Check:**
```javascript
// Check container visibility
let container = document.querySelector('[data-kiosk-canvas]');
let styles = window.getComputedStyle(container);
console.log('Container display:', styles.display);  // Should be "block" or not "none"
console.log('Container width:', container.clientWidth);
console.log('Container height:', container.clientHeight);
```

## Advanced Debugging

### Check all canvas-related DOM elements
```javascript
// List all canvas elements
document.querySelectorAll('canvas').forEach((c, i) => {
  console.log(`Canvas ${i}:`, c.clientWidth, 'x', c.clientHeight, 'pixels');
});

// Check if Fortu app is full-screen
console.log('Window size:', window.innerWidth, 'x', window.innerHeight);
```

### Monitor console in real-time
Scroll up in console to see initialization logs like:
```
[App] Initialized
[Canvas] 2D context obtained  
[Canvas] Attaching native event listeners (touch, mouse, pointer)
```

If you don't see these, the app may not be loading correctly.

### Force canvas reinitialization
```javascript
// WARNING: This will clear any drawings!
// Get the canvas and trigger a resize
let canvas = document.querySelector('canvas');
let container = document.querySelector('[data-kiosk-canvas]');
if (canvas && container) {
  // Trigger ResizeObserver if active
  container.style.width = container.clientWidth + 1 + 'px';
  setTimeout(() => {
    container.style.width = container.clientWidth - 1 + 'px';
  }, 100);
}
```

## Report Template for Developer

When reporting issues, provide this information:

```
=== CANVAS DEBUG REPORT ===
Timestamp: [from printReport()]
Canvas exists: YES/NO
Canvas dimensions: [from report]
2D Context exists: YES/NO
Events received: [counts from showEventCounts()]
Browser: Xibo [version]
Display: Fortu 44"
Issue: [What happens when you try to draw?]

Errors from report:
[paste any errors shown]
```

## Emergency Fixes to Try

If drawing still doesn't work after diagnostics:

1. **Restart the display**
   - Power cycle the Fortu display
   - Let it fully boot and reload the app

2. **Clear cache**
   - In Xibo settings, clear browser cache
   - Navigate to app again

3. **Update Xibo**
   - Check if there's a newer Xibo version
   - Older versions may have more bugs

4. **Use keyboard input as fallback**
   - As last resort, could add text-input mode
   - Would bypass canvas completely

## For Developers: Implementation Details

The fix implements:

1. **InitCanvas Fallback** (EnhancedCanvas.tsx line ~117)
   - If `getBoundingClientRect()` returns 0, uses window dimensions as fallback
   - Forces initialization with `forceWindowDims` parameter

2. **Timeout-Based Initialization** (EnhancedCanvas.tsx line ~159)
   - If ResizeObserver doesn't trigger within 500ms, forces init
   - Logs which path was taken (immediate, ResizeObserver, or timeout)

3. **Enhanced Event Logging** (EnhancedCanvas.tsx line ~280)
   - All event handlers log why they blocked/proceeded
   - Includes position coordinates when drawing starts

4. **Debug Utilities Module** (canvasDebug.ts)
   - `getCanvasDebugReport()` - Gathered diagnostics
   - `printCanvasDebugReport()` - Formatted console output
   - `testCanvasEvents()` - Event delivery testing
   - Installed globally via App.tsx

## Next Steps

1. Deploy the updated code to Fortu
2. Open F12 console on Fortu
3. Run `canvasDebug.printReport()`
4. Share the output with the development team
5. Follow up with `canvasDebug.testEvents()` results if needed
