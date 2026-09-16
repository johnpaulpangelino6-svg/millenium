# Add Brains Logo Image

## Instructions

1. **Download the logo** from: https://i.imgur.com/9X8ZQJm.png
   - Right-click and "Save Image As..."
   - Or use the provided logo file

2. **Save the logo** to this directory as:
   - `brains-logo.png`

3. **Location**: `public/images/brains-logo.png`

## Alternative: Use PowerShell to Download

Run this command in PowerShell from the project root:

```powershell
Invoke-WebRequest -Uri "https://i.imgur.com/9X8ZQJm.png" -OutFile "public/images/brains-logo.png"
```

## Verify

After adding the logo, it should be at:
```
c:\xampp\htdocs\millenium-smartboard-main\public\images\brains-logo.png
```

The HTML has been updated to reference: `/images/brains-logo.png`
