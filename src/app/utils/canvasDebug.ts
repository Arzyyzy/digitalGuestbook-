/**
 * Canvas Debugging Utilities for Fortu/Xibo Signage Compatibility
 * 
 * This module provides diagnostic functions to troubleshoot canvas rendering issues
 * on legacy devices like Fortu 44" signage displays with old Android WebView.
 */

interface CanvasDebugReport {
  timestamp: string;
  canvasDomExists: boolean;
  canvasDimensions: {
    clientWidth: number;
    clientHeight: number;
    screenWidth: number;
    screenHeight: number;
    devicePixelRatio: number;
  };
  contextStatus: {
    context2dExists: boolean;
    contextType: string;
  };
  eventListeners: {
    touchSupported: boolean;
    pointerSupported: boolean;
    mouseSupported: boolean;
  };
  containerDimensions: {
    containerWidth: number;
    containerHeight: number;
    computedStyle: Record<string, string>;
  };
  errors: string[];
  warnings: string[];
}

/**
 * Get comprehensive diagnostic report for canvas and container
 */
export function getCanvasDebugReport(): CanvasDebugReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Find canvas element
  const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    errors.push('Canvas element not found in DOM');
  }

  // Find container
  const container = document.querySelector('[data-kiosk-canvas]') as HTMLDivElement | null;
  if (!container) {
    warnings.push('Kiosk canvas container not found');
  }

  // Get dimensions
  const canvasDimensions = canvas ? canvas.getBoundingClientRect() : null;
  const containerComputedStyle = container ? window.getComputedStyle(container) : null;

  // Check context
  let context2dExists = false;
  let contextType = 'none';
  if (canvas) {
    try {
      const ctx = canvas.getContext('2d');
      context2dExists = !!ctx;
      contextType = ctx ? '2d' : 'failed';
    } catch (e) {
      contextType = 'error: ' + String(e);
      errors.push('Failed to get 2D context: ' + String(e));
    }
  }

  // Check event support
  const touchSupported = 'ontouchstart' in window;
  const pointerSupported = 'onpointerdown' in window;
  const mouseSupported = 'onmousedown' in window;

  if (!touchSupported && !pointerSupported && !mouseSupported) {
    errors.push('No pointer event types supported');
  }

  // Check dimensions
  if (canvas && canvasDimensions && canvasDimensions.width === 0 && canvasDimensions.height === 0) {
    errors.push('Canvas has zero dimensions');
  }

  if (container && containerComputedStyle) {
    const display = containerComputedStyle.display;
    const visibility = containerComputedStyle.visibility;
    const opacity = containerComputedStyle.opacity;

    if (display === 'none') {
      errors.push('Container display is "none"');
    }
    if (visibility === 'hidden') {
      errors.push('Container visibility is "hidden"');
    }
    if (opacity === '0') {
      errors.push('Container opacity is 0');
    }
  }

  return {
    timestamp: new Date().toISOString(),
    canvasDomExists: !!canvas,
    canvasDimensions: {
      clientWidth: canvas?.clientWidth ?? 0,
      clientHeight: canvas?.clientHeight ?? 0,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    },
    contextStatus: {
      context2dExists,
      contextType,
    },
    eventListeners: {
      touchSupported,
      pointerSupported,
      mouseSupported,
    },
    containerDimensions: {
      containerWidth: container?.clientWidth ?? 0,
      containerHeight: container?.clientHeight ?? 0,
      computedStyle: containerComputedStyle ? {
        display: containerComputedStyle.display,
        position: containerComputedStyle.position,
        visibility: containerComputedStyle.visibility,
        opacity: containerComputedStyle.opacity,
        zIndex: containerComputedStyle.zIndex,
        width: containerComputedStyle.width,
        height: containerComputedStyle.height,
      } : {},
    },
    errors,
    warnings,
  };
}

/**
 * Print formatted debug report to console
 */
export function printCanvasDebugReport(): void {
  const report = getCanvasDebugReport();

  console.log('%c=== CANVAS DEBUG REPORT ===', 'color: #FF6B6B; font-weight: bold; font-size: 14px;');
  console.log('Timestamp:', report.timestamp);

  console.group('%cDOM Status', 'color: #4ECDC4; font-weight: bold;');
  console.log('Canvas exists:', report.canvasDomExists);
  console.group('%cCanvas Dimensions', 'color: #95E1D3;');
  console.table(report.canvasDimensions);
  console.groupEnd();

  console.group('%cContainer Dimensions', 'color: #95E1D3;');
  console.log('Width:', report.containerDimensions.containerWidth);
  console.log('Height:', report.containerDimensions.containerHeight);
  console.table(report.containerDimensions.computedStyle);
  console.groupEnd();
  console.groupEnd();

  console.group('%cContext Status', 'color: #FFE66D; font-weight: bold;');
  console.log('2D Context exists:', report.contextStatus.context2dExists);
  console.log('Context type:', report.contextStatus.contextType);
  console.groupEnd();

  console.group('%cEvent Support', 'color: #95E1D3; font-weight: bold;');
  console.log('Touch supported:', report.eventListeners.touchSupported);
  console.log('Pointer supported:', report.eventListeners.pointerSupported);
  console.log('Mouse supported:', report.eventListeners.mouseSupported);
  console.groupEnd();

  if (report.errors.length > 0) {
    console.group('%cERRORS', 'color: #FF6B6B; font-weight: bold;');
    report.errors.forEach(err => console.error(err));
    console.groupEnd();
  }

  if (report.warnings.length > 0) {
    console.group('%cWARNINGS', 'color: #FFE66D; font-weight: bold;');
    report.warnings.forEach(warn => console.warn(warn));
    console.groupEnd();
  }

  console.log('%c=== END REPORT ===', 'color: #FF6B6B; font-weight: bold; font-size: 14px;');
}

/**
 * Test event delivery to canvas
 */
export function testCanvasEvents(): void {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    console.error('Canvas not found');
    return;
  }

  console.log('%cTesting canvas event delivery...', 'color: #4ECDC4; font-weight: bold;');

  const listeners = {
    touchstart: 0,
    touchmove: 0,
    touchend: 0,
    mousedown: 0,
    mousemove: 0,
    mouseup: 0,
    pointerdown: 0,
    pointermove: 0,
    pointerup: 0,
  };

  const createListener = (eventName: keyof typeof listeners) => () => {
    listeners[eventName]++;
    console.log('[' + eventName.toUpperCase() + '] fired');
  };

  // Attach test listeners
  Object.keys(listeners).forEach(eventName => {
    canvas.addEventListener(eventName, createListener(eventName as keyof typeof listeners));
  });

  console.log('Test listeners attached. Try touching/clicking the canvas...');
  console.log('Call showCanvasEventCounts() to see results.');

  // Store in window for access
  (window as any).__canvasEventCounts = listeners;
}

/**
 * Show accumulated event counts
 */
export function showCanvasEventCounts(): void {
  const counts = (window as any).__canvasEventCounts;
  if (!counts) {
    console.log('No event counts recorded. Call testCanvasEvents() first.');
    return;
  }
  console.log('%cCanvas Event Counts', 'color: #4ECDC4; font-weight: bold;');
  console.table(counts);
}

/**
 * Export functions to window for console access
 */
export function installCanvasDebugGlobals(): void {
  (window as any).canvasDebug = {
    report: getCanvasDebugReport,
    printReport: printCanvasDebugReport,
    testEvents: testCanvasEvents,
    showEventCounts: showCanvasEventCounts,
  };
  console.log('%cCanvas debug tools installed!', 'color: #4ECDC4; font-weight: bold;');
  console.log('Available commands:');
  console.log('  canvasDebug.printReport() - Show full debug report');
  console.log('  canvasDebug.testEvents() - Start recording canvas events');
  console.log('  canvasDebug.showEventCounts() - Show recorded event counts');
}
