# CDP Commands Reference

Commonly used Chrome DevTools Protocol commands for the `/cdp` endpoint. Full reference: https://chromedevtools.github.io/devtools-protocol/

## Usage Pattern

```bash
browse-cli.sh cdp <tabId> "<Domain.method>" '<params_json>'
```

## DOM

### Get Document Root
```json
{"method": "DOM.getDocument", "params": {}}
```
Returns `{root: {nodeId, ...}}`. Needed before other DOM queries.

### Query Selector
```json
{"method": "DOM.querySelector", "params": {"nodeId": 1, "selector": "button.submit"}}
```
Returns `{nodeId}`. Must call `DOM.getDocument` first.

### Get Outer HTML
```json
{"method": "DOM.getOuterHTML", "params": {"nodeId": 123}}
```

### Get Box Model (for coordinates)
```json
{"method": "DOM.getBoxModel", "params": {"nodeId": 123}}
```
Returns `{model: {content: [x1,y1,x2,y2,...], ...}}`.

## Runtime

### Evaluate Expression
```json
{"method": "Runtime.evaluate", "params": {"expression": "document.title", "returnByValue": true}}
```

### Call Function on Object
```json
{"method": "Runtime.callFunctionOn", "params": {"objectId": "...", "functionDeclaration": "function() { return this.value; }", "returnByValue": true}}
```

## Page

### Navigate
```json
{"method": "Page.navigate", "params": {"url": "https://example.com"}}
```

### Capture Screenshot
```json
{"method": "Page.captureScreenshot", "params": {"format": "png", "quality": 80}}
```
Returns `{data: "base64..."}`.

### Print to PDF
```json
{"method": "Page.printToPDF", "params": {"landscape": false, "printBackground": true}}
```

### Reload
```json
{"method": "Page.reload", "params": {"ignoreCache": true}}
```

## Network

### Enable Network Monitoring
```json
{"method": "Network.enable", "params": {}}
```
After enabling, events like `Network.requestWillBeSent` and `Network.responseReceived` fire.

### Get Response Body
```json
{"method": "Network.getResponseBody", "params": {"requestId": "..."}}
```

### Set Extra Headers
```json
{"method": "Network.setExtraHTTPHeaders", "params": {"headers": {"X-Custom": "value"}}}
```

## Input

### Dispatch Mouse Event
```json
{"method": "Input.dispatchMouseEvent", "params": {"type": "mousePressed", "x": 100, "y": 200, "button": "left", "clickCount": 1}}
```
Follow with `mouseReleased` for a full click.

### Dispatch Key Event
```json
{"method": "Input.dispatchKeyEvent", "params": {"type": "keyDown", "key": "Enter", "code": "Enter"}}
```

## Emulation

### Set Device Metrics
```json
{"method": "Emulation.setDeviceMetricsOverride", "params": {"width": 375, "height": 812, "deviceScaleFactor": 3, "mobile": true}}
```

### Set Geolocation
```json
{"method": "Emulation.setGeolocationOverride", "params": {"latitude": 37.7749, "longitude": -122.4194, "accuracy": 100}}
```

## Storage

### Get Cookies
```json
{"method": "Network.getCookies", "params": {}}
```

### Clear Browser Cache
```json
{"method": "Network.clearBrowserCache", "params": {}}
```

## Tips

- Always call `DOM.getDocument` before any DOM queries to get the root nodeId
- Use `Runtime.evaluate` with `returnByValue: true` for JSON-serializable results
- Use `awaitPromise: true` in Runtime.evaluate for async expressions
- Network events require `Network.enable` first
- Input events need precise coordinates from DOM.getBoxModel or Runtime.evaluate
