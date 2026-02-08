# Shadow DOM Patterns

Many modern web apps use Shadow DOM (web components, Lit, Shoelace, etc.). Standard `querySelector` cannot pierce shadow boundaries. Use these patterns with the `/evaluate` endpoint.

## Detecting Shadow DOM

```javascript
// Check if an element has a shadow root
document.querySelector('my-component').shadowRoot !== null
```

## Querying Inside Shadow DOM

### Single Level
```javascript
document.querySelector('my-component')
  .shadowRoot
  .querySelector('.inner-button')
```

### Nested Shadow DOM
```javascript
document.querySelector('outer-component')
  .shadowRoot
  .querySelector('inner-component')
  .shadowRoot
  .querySelector('button')
```

## Deep Query Helper

Use this recursive helper to find elements across shadow boundaries:

```javascript
function deepQuery(selector, root = document) {
  const el = root.querySelector(selector);
  if (el) return el;

  // Search shadow roots
  const allElements = root.querySelectorAll('*');
  for (const element of allElements) {
    if (element.shadowRoot) {
      const found = deepQuery(selector, element.shadowRoot);
      if (found) return found;
    }
  }
  return null;
}

// Usage
const btn = deepQuery('button.submit');
```

## Getting Click Coordinates for Shadow Elements

```javascript
const el = deepQuery('.target-element');
if (el) {
  const rect = el.getBoundingClientRect();
  JSON.stringify({
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
    tag: el.tagName,
    text: el.textContent.trim().substring(0, 50)
  });
} else {
  JSON.stringify({error: 'Element not found'});
}
```

## Common Shadow DOM Frameworks

| Framework | Shadow DOM Usage |
|-----------|-----------------|
| Salesforce Lightning | Heavy, nested shadow DOMs |
| Shopify Polaris (web components) | Moderate |
| Google Material Web | Open shadow roots |
| Ionic / Stencil | Open shadow roots |
| Angular (ViewEncapsulation.ShadowDom) | Configurable |

## Tips

- Most shadow roots are **open** (`mode: 'open'`), so `.shadowRoot` works
- **Closed** shadow roots (`mode: 'closed'`) cannot be accessed from outside
- Use `element.shadowRoot.innerHTML` to inspect shadow DOM content
- Event listeners on shadow DOM elements bubble up normally
- CSS custom properties (`--var`) pierce shadow boundaries; other styles don't
