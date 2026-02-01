#!/usr/bin/env python3
"""Generate simple icons for the Browser Relay extension."""

from PIL import Image, ImageDraw

def create_icon(size: int, path: str):
    """Create a simple relay-style icon."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background circle
    margin = size // 8
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill='#4CAF50'
    )

    # Inner connector symbol (two dots with line)
    center = size // 2
    dot_size = size // 6
    gap = size // 4

    # Left dot
    draw.ellipse(
        [center - gap - dot_size//2, center - dot_size//2,
         center - gap + dot_size//2, center + dot_size//2],
        fill='white'
    )

    # Right dot
    draw.ellipse(
        [center + gap - dot_size//2, center - dot_size//2,
         center + gap + dot_size//2, center + dot_size//2],
        fill='white'
    )

    # Connecting line
    line_width = max(2, size // 16)
    draw.line(
        [center - gap + dot_size//2, center, center + gap - dot_size//2, center],
        fill='white',
        width=line_width
    )

    img.save(path)
    print(f"Created {path}")

# Create icons at different sizes
create_icon(16, 'extension/icons/icon16.png')
create_icon(48, 'extension/icons/icon48.png')
create_icon(128, 'extension/icons/icon128.png')

print("All icons created!")
