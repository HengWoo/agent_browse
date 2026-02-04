# Calendar Selection Notes - Meituan POS

## Working Solution

### The Pattern That Works

To click elements inside shadow DOM, use CDP's Accessibility API:

```python
# 1. Get accessibility tree (sees through shadow DOM)
result = cdp("Accessibility.getFullAXTree")

# 2. Find element by name/role
for node in result['nodes']:
    if node['name']['value'] == 'target_name':
        backend_id = node['backendDOMNodeId']
        break

# 3. Get bounding box via DOM API
box = cdp("DOM.getBoxModel", {"backendNodeId": backend_id})
content = box['model']['content']  # [x1, y1, x2, y2, x3, y3, x4, y4]
x = (content[0] + content[2]) / 2  # center x
y = (content[1] + content[5]) / 2  # center y

# 4. Click using CDP mouse events
click(x, y)
```

### Why This Works

- `Accessibility.getFullAXTree` sees through shadow DOM (like screen readers)
- `DOM.getBoxModel` returns accurate pixel coordinates
- No JavaScript execution in page = no server crashes
- CDP mouse events work regardless of DOM structure

### Page Structure (Meituan)

```
document
└── <RENDER-BOX-ROOT-X class="rb_iframe">  ← Shadow host
    └── #shadow-root
        └── All report content (date pickers, tables, etc.)
```

The iframe (`dpaas-report-container`) has `display: none` - it's NOT the visible content.

## Calendar Navigation Workflow

### Opening the Calendar
```python
# Find date input by placeholder
find_element(name="开始日期", role="textbox")  # or "结束日期"
click(coordinates)
```

### Selecting Year
```python
# 1. Click year header (e.g., "2026年")
find_element(name="2026年", role="button")
click(coordinates)

# 2. Year grid appears - click target year
find_element(name="2025")
click(coordinates)
```

### Selecting Month
```python
# 1. Click month header (e.g., "1月")
find_element(name="1月", role="button")
click(coordinates)

# 2. Month grid appears - click target month
find_element(name="12月")
click(coordinates)
```

### Selecting Date Range
```python
# 1. Click start day
find_element(name="1", role="cell")
click(coordinates)

# 2. Click end day (calendar may scroll to next month)
find_element(name="31", role="cell")
click(coordinates)
# Calendar closes automatically after selecting end date
```

### Quick Select Buttons

Located at bottom of calendar popup:
- **今日** - Today
- **昨日** - Yesterday
- **本周** - This week
- **本月** - This month (relative to today)
- **上月** - Last month (relative to today)

**Note:** "上月" selects last month relative to TODAY, not navigation back in calendar.

## Complete Report Export Workflow

```
1. Select date range (see calendar navigation below)
2. Click 查询 (query) → loads data for selected dates
3. Click 导出 (export) → downloads Excel file
```

**Important:** Data must be loaded via 查询 before 导出 will export the correct date range.

### Tested Example: Export December 2025 Data

```python
# 1. Open calendar and select dates
click(date_input)           # (358, 261)
click("2026年")             # (430, 300) → year selector
click("2025")               # (357, 486)
click("1月")                # (472, 300) → month selector
click("12月")               # (533, 552)
click(day_1)                # (335, 376) → start date
click(day_31)               # (407, 376) → end date, calendar closes

# 2. Load data
click("查询")               # find via accessibility tree

# 3. Export
click("导出")               # (1604, 169) → triggers .xlsx download
```

Result: `有点东西餐饮有限公司_会员消费_20260202_0257.xlsx` downloaded to ~/Downloads/

## What Didn't Work

1. **Visual coordinate guessing** - Inaccurate, missed targets
2. **JavaScript getBoundingClientRect() in shadow DOM** - Caused 500 server errors
3. **Accessing iframe content** - iframe has `display: none`, not the real content
4. **document.elementFromPoint()** - Returns shadow host, can't pierce shadow DOM

## Environment Notes

- Page zoom: 90%
- Device pixel ratio: 1.8
- CSS viewport: 1804 x 1000
- Box model coordinates are in CSS pixels (correct for clicking)
