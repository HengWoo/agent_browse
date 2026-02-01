#!/usr/bin/env python3
"""
Browser Relay Server

This server bridges Claude Code (HTTP client) with the Browser Relay Extension (WebSocket).

Architecture:
    Claude Code ──HTTP──► Relay Server ◄──WebSocket──► Chrome Extension
                              │
                         Forwards commands
                         Returns results

Usage:
    uv run python relay_server.py

Endpoints:
    GET  /              - Server info
    GET  /tabs          - List all tabs
    POST /attach        - Attach to a tab
    POST /detach        - Detach from a tab
    POST /navigate      - Navigate to URL
    POST /click         - Click at coordinates
    POST /type          - Type text
    POST /evaluate      - Execute JavaScript
    POST /screenshot    - Capture screenshot
    POST /cdp           - Raw CDP command
"""

import asyncio
import json
import logging
import uuid
from aiohttp import web, WSMsgType

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# Configuration
HOST = "127.0.0.1"
PORT = 18800


class RelayServer:
    def __init__(self):
        self.extension_ws = None  # WebSocket connection to extension
        self.pending_requests = {}  # id -> asyncio.Future

    async def handle_extension_ws(self, request):
        """Handle WebSocket connection from the extension."""
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        logger.info("Extension connected via WebSocket")
        self.extension_ws = ws

        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    await self.handle_extension_message(data)
                elif msg.type == WSMsgType.ERROR:
                    logger.error(f"WebSocket error: {ws.exception()}")
        finally:
            logger.info("Extension disconnected")
            self.extension_ws = None

        return ws

    async def handle_extension_message(self, data):
        """Handle message from extension."""
        msg_type = data.get("type")
        msg_id = data.get("id")

        if msg_type == "status":
            logger.info(f"Extension status: {data.get('attachedTabs', [])}")
        elif msg_type == "tabDetached":
            logger.info(f"Tab {data.get('tabId')} detached: {data.get('reason')}")
        elif msg_type == "tabClosed":
            logger.info(f"Tab {data.get('tabId')} closed")
        elif msg_id and msg_id in self.pending_requests:
            # This is a response to a pending request
            future = self.pending_requests.pop(msg_id)
            future.set_result(data)

    async def send_to_extension(self, action: str, **params) -> dict:
        """Send command to extension and wait for response."""
        if not self.extension_ws:
            return {"error": "Extension not connected"}

        # Generate request ID
        request_id = str(uuid.uuid4())[:8]

        # Create future for response
        future = asyncio.Future()
        self.pending_requests[request_id] = future

        # Send command
        message = {"id": request_id, "action": action, **params}
        await self.extension_ws.send_json(message)

        # Wait for response (with timeout)
        try:
            result = await asyncio.wait_for(future, timeout=30.0)
            return result
        except asyncio.TimeoutError:
            self.pending_requests.pop(request_id, None)
            return {"error": "Request timeout"}

    # ============== HTTP Handlers ==============

    async def handle_index(self, request):
        """Server info."""
        return web.json_response({
            "name": "Browser Relay Server",
            "version": "1.0.0",
            "extension_connected": self.extension_ws is not None,
            "endpoints": {
                "GET /": "Server info",
                "GET /tabs": "List all browser tabs",
                "POST /attach": "Attach to tab (body: {tabId})",
                "POST /detach": "Detach from tab (body: {tabId})",
                "POST /navigate": "Navigate (body: {tabId, url})",
                "POST /click": "Click (body: {tabId, x, y})",
                "POST /type": "Type text (body: {tabId, text})",
                "POST /evaluate": "Evaluate JS (body: {tabId, expression})",
                "POST /screenshot": "Screenshot (body: {tabId})",
                "POST /cdp": "Raw CDP (body: {tabId, method, params})",
            }
        })

    async def handle_tabs(self, request):
        """List all tabs."""
        result = await self.send_to_extension("listTabs")
        return web.json_response(result)

    async def handle_attach(self, request):
        """Attach to a tab."""
        data = await request.json()
        tab_id = data.get("tabId")
        if not tab_id:
            return web.json_response({"error": "tabId required"}, status=400)

        result = await self.send_to_extension("attach", tabId=tab_id)
        return web.json_response(result)

    async def handle_detach(self, request):
        """Detach from a tab."""
        data = await request.json()
        tab_id = data.get("tabId")

        result = await self.send_to_extension("detach", tabId=tab_id)
        return web.json_response(result)

    async def handle_navigate(self, request):
        """Navigate to URL."""
        data = await request.json()
        tab_id = data.get("tabId")
        url = data.get("url")

        if not url:
            return web.json_response({"error": "url required"}, status=400)

        result = await self.send_to_extension("navigate", tabId=tab_id, url=url)
        return web.json_response(result)

    async def handle_click(self, request):
        """Click at coordinates."""
        data = await request.json()
        tab_id = data.get("tabId")
        x = data.get("x")
        y = data.get("y")

        if x is None or y is None:
            return web.json_response({"error": "x and y required"}, status=400)

        result = await self.send_to_extension("click", tabId=tab_id, x=x, y=y)
        return web.json_response(result)

    async def handle_type(self, request):
        """Type text."""
        data = await request.json()
        tab_id = data.get("tabId")
        text = data.get("text")

        if not text:
            return web.json_response({"error": "text required"}, status=400)

        result = await self.send_to_extension("type", tabId=tab_id, text=text)
        return web.json_response(result)

    async def handle_evaluate(self, request):
        """Evaluate JavaScript."""
        data = await request.json()
        tab_id = data.get("tabId")
        expression = data.get("expression")

        if not expression:
            return web.json_response({"error": "expression required"}, status=400)

        result = await self.send_to_extension("evaluate", tabId=tab_id, expression=expression)
        return web.json_response(result)

    async def handle_screenshot(self, request):
        """Capture screenshot."""
        data = await request.json()
        tab_id = data.get("tabId")

        result = await self.send_to_extension("screenshot", tabId=tab_id)
        return web.json_response(result)

    async def handle_page_info(self, request):
        """Get page info (URL, title, text)."""
        data = await request.json()
        tab_id = data.get("tabId")

        result = await self.send_to_extension("getPageInfo", tabId=tab_id)
        return web.json_response(result)

    async def handle_cdp(self, request):
        """Execute raw CDP command."""
        data = await request.json()
        tab_id = data.get("tabId")
        method = data.get("method")
        params = data.get("params", {})

        if not method:
            return web.json_response({"error": "method required"}, status=400)

        result = await self.send_to_extension("cdp", tabId=tab_id, method=method, params=params)
        return web.json_response(result)

    def create_app(self):
        """Create the aiohttp application."""
        app = web.Application()

        # Add CORS middleware
        async def cors_middleware(app, handler):
            async def middleware_handler(request):
                if request.method == "OPTIONS":
                    response = web.Response()
                else:
                    response = await handler(request)

                response.headers["Access-Control-Allow-Origin"] = "*"
                response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
                response.headers["Access-Control-Allow-Headers"] = "Content-Type"
                return response
            return middleware_handler

        app.middlewares.append(cors_middleware)

        # Routes
        app.router.add_get("/", self.handle_index)
        app.router.add_get("/ws", self.handle_extension_ws)
        app.router.add_get("/tabs", self.handle_tabs)
        app.router.add_post("/attach", self.handle_attach)
        app.router.add_post("/detach", self.handle_detach)
        app.router.add_post("/navigate", self.handle_navigate)
        app.router.add_post("/click", self.handle_click)
        app.router.add_post("/type", self.handle_type)
        app.router.add_post("/evaluate", self.handle_evaluate)
        app.router.add_post("/screenshot", self.handle_screenshot)
        app.router.add_post("/pageInfo", self.handle_page_info)
        app.router.add_post("/cdp", self.handle_cdp)

        return app


def main():
    server = RelayServer()
    app = server.create_app()

    logger.info(f"Starting Browser Relay Server at http://{HOST}:{PORT}")
    logger.info("Waiting for extension to connect...")
    logger.info("")
    logger.info("To use:")
    logger.info("  1. Load the extension from ./extension/ in Chrome")
    logger.info("  2. Click the extension icon on a tab to attach")
    logger.info("  3. Send HTTP requests to http://127.0.0.1:18800")
    logger.info("")

    web.run_app(app, host=HOST, port=PORT, print=None)


if __name__ == "__main__":
    main()
