# Warranty Scanner Feature - Implementation Guide

## Overview
The Warranty Scanner is a camera-based QR/barcode scanning system that validates warranty coverage for Millennium SmartBoard devices. It provides instant validation with detailed coverage information including days remaining, warranty status, and comprehensive device details.

---

## Features

### ✅ **Camera-Based Scanning**
- Real-time QR code and barcode detection
- Supports multiple formats: QR Code, Code 128, Code 39, EAN-13, EAN-8, UPC-A, UPC-E
- Uses device back camera for optimal scanning
- Automatic code detection with visual feedback

### ✅ **Image Upload Scanning**
- Upload barcode/QR code images from device
- Scan barcodes from photos or screenshots
- Supports all major image formats (JPG, PNG, GIF, BMP, WebP)
- Perfect for remote validation or when camera isn't available
- Maximum file size: 10MB
- Instant decoding from uploaded images

### ✅ **Manual Entry Option**
- Alternative input method for serial numbers
- Supports device ID or serial number lookup
- Instant validation without camera or image

### ✅ **Comprehensive Warranty Validation**
- Days remaining calculation with precision
- Warranty status detection (Active, Expiring Soon, Expired)
- Coverage percentage with visual progress bar
- Time remaining in years, months, and days format

### ✅ **Detailed Information Display**
- Device information (ID, serial, model, location)
- Warranty contract details (ID, coverage type, dates)
- Timeline visualization with progress indicator
- Color-coded status indicators

### ✅ **Responsive Design**
- Mobile-optimized interface
- Desktop camera support
- Touch-friendly controls
- Dark mode compatible

---

## User Interface Components

### 1. **Scan Warranty Button**
Located in the Warranty tab header, accessible to all roles (Admin, Technician, Customer).

```html
<button class="btn btn-primary" onclick="openWarrantyScannerModal()">
  📷 Scan Warranty
</button>
```

### 2. **Scanner Modal**
Four-option interface:
- **Instructions**: Initial screen with three scanning options
  - 📷 **Camera Scanner**: Start live camera scanning
  - 🖼️ **Upload Image**: Upload barcode image file
  - ✍️ **Manual Input**: Enter serial number manually
- **Camera View**: Live camera feed with scanning status
- **Image Preview**: Uploaded image with scan button
- **Results**: Validation results with comprehensive warranty details

### 3. **Scanning Methods**

#### Camera Scanning
- Click "📷 Camera Scanner"
- Point camera at barcode
- Automatic detection
- Instant validation

#### Image Upload
- Click "🖼️ Upload Image"
- Select image file from device
- Preview uploaded image
- Click "🔍 Scan Image" to decode
- Supports: JPG, PNG, GIF, BMP, WebP
- Max size: 10MB

#### Manual Entry
- Type serial number in input field
- Click "Check" button
- Instant validation

### 4. **Validation Results**
Displays:
- Status icon and header (✅/⚠️/❌)
- Time remaining in human-readable format
- Device information card
- Warranty coverage details
- Timeline progress bar
- Actionable status message

---

## Technical Implementation

### Files Modified

#### 1. **index.html**
- Added HTML5-Qrcode library CDN
- Added warranty scanner modal with three sections
- Integrated camera preview container

#### 2. **app.js**
Added functions:
- `openWarrantyScannerModal()` - Opens scanner modal
- `closeWarrantyScannerModal()` - Closes modal and stops camera
- `resetWarrantyScanner()` - Resets to initial state
- `startWarrantyScanner()` - Initializes camera with Html5Qrcode
- `stopWarrantyScanner()` - Stops camera and clears resources
- `onScanSuccess()` - Handles successful scan
- `onScanFailure()` - Handles scan errors
- `updateScannerStatus()` - Updates status display
- `validateManualSerial()` - Validates manual input
- `triggerBarcodeImageUpload()` - Opens file picker
- `handleBarcodeImageUpload()` - Processes uploaded image
- `clearUploadedImage()` - Clears image preview
- `scanUploadedImage()` - Decodes barcode from uploaded image
- `validateWarrantyBySerial()` - Main validation logic
- `calculateWarrantyDetails()` - Computes warranty metrics
- `displayWarrantyResults()` - Renders validation UI
- `displayWarrantyNotFound()` - Shows device not found error
- `displayNoWarrantyRecord()` - Shows no warranty error

#### 3. **style.css**
Added CSS for:
- Scanner container layouts
- Camera view styling
- Status bar with animations
- Image upload preview area
- Image preview styling with borders
- Scan status display
- Validation result cards
- Warranty info grid
- Responsive design
- Dark mode support

---

## Usage Guide

### For Admin/Technician

1. **Navigate to Warranty Tab**
   - Click "Warranty" in the sidebar navigation

2. **Open Scanner**
   - Click "📷 Scan Warranty" button in the page header

3. **Choose Scanning Method**
   - **Option A - Camera**: Click "📷 Camera Scanner" and point at QR code/barcode
   - **Option B - Upload**: Click "🖼️ Upload Image", select image file, then click "🔍 Scan Image"
   - **Option C - Manual**: Enter serial number in text field and click "Check"

4. **View Results**
   - Review warranty status and details
   - Check days remaining
   - Verify coverage type
   - Click "Scan Another" to validate more devices

### For Customers

Same workflow, but limited to viewing their own device warranties.

---

## Image Upload Scanning Guide

### When to Use Image Upload
- Remote warranty validation (customer sends photo)
- Camera access denied or unavailable
- Scanning printed barcode stickers
- Validating barcodes from screenshots
- Poor lighting conditions for live camera
- Multiple barcodes to scan from saved images

### Supported Image Formats
- ✅ **JPEG/JPG** - Most common format
- ✅ **PNG** - High quality, transparent backgrounds
- ✅ **GIF** - Animated or static images
- ✅ **BMP** - Bitmap format
- ✅ **WebP** - Modern web format
- ✅ **Maximum file size**: 10MB

### How to Upload and Scan

1. **Take or Find Image**
   - Photograph the barcode with smartphone
   - Screenshot from PDF or document
   - Save barcode image from email/website

2. **Upload to Scanner**
   - Open warranty scanner modal
   - Click "🖼️ Upload Image" button
   - Select image file from device
   - Image preview appears

3. **Scan the Image**
   - Review image preview
   - Click "🔍 Scan Image" button
   - Wait for barcode detection
   - View validation results

4. **Clear or Retry**
   - Click "✕ Clear" to remove image
   - Upload different image if needed
   - Try camera scanner if image fails

### Tips for Best Results

**Image Quality**
- Use high-resolution images (at least 1024px wide)
- Ensure barcode is in focus and clear
- Avoid blurry or pixelated images
- Good lighting with minimal glare

**Barcode Visibility**
- Entire barcode visible in frame
- No obstructions or damage
- Barcode perpendicular to camera
- Adequate contrast (dark bars on light background)

**File Preparation**
- Crop to show barcode clearly
- Rotate image if barcode is sideways
- Adjust brightness if too dark
- Remove filters or effects

---

## Warranty Status Logic

### Status Determination
```javascript
if (daysRemaining < 0) {
  status = "Warranty Expired"
  color = "error" (red)
}
else if (daysRemaining <= 30) {
  status = "Expiring Soon"
  color = "warning" (amber)
}
else {
  status = "Under Warranty"
  color = "success" (green)
}
```

### Days Remaining Calculation
```javascript
const today = new Date();
const expiryDate = new Date(warranty.expiryDate);
const timeDiff = expiryDate.getTime() - today.getTime();
const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
```

### Display Format
- **< 30 days**: Show in days
- **30-365 days**: Show in months and days
- **> 365 days**: Show in years and months

---

## API Integration

### Device Lookup
```javascript
// Searches by serial number or device ID
const device = state.devices.find(d => 
  d.serialNumber === serialNumber || 
  d.id === serialNumber ||
  d.serialNumber.includes(serialNumber) ||
  d.id.includes(serialNumber)
);
```

### Warranty Lookup
```javascript
// Finds warranty by device ID
const warranty = state.warranties.find(w => w.deviceId === device.id);
```

### Fallback to API
If not found in local state, fetches from:
- `GET /api/devices`
- `GET /api/warranties`

---

## Error Handling

### 1. **Camera Access Denied**
- Shows error message
- Suggests checking permissions
- Falls back to manual input

### 2. **Device Not Found**
- Displays "Device Not Found" message
- Shows entered serial number
- Suggests contacting support

### 3. **No Warranty Record**
- Displays "No Warranty Record" message
- Shows device information
- Suggests registering warranty

### 4. **Network Error**
- Shows validation error
- Suggests checking connection
- Allows retry

---

## Supported Barcode Formats

Using Html5Qrcode library:
- ✅ QR Code
- ✅ Code 128
- ✅ Code 39
- ✅ EAN-13
- ✅ EAN-8
- ✅ UPC-A
- ✅ UPC-E

---

## Browser Compatibility

### Camera Access Requirements
- HTTPS connection (or localhost)
- Browser camera permissions granted
- getUserMedia API support

### Supported Browsers
- ✅ Chrome 53+
- ✅ Firefox 36+
- ✅ Safari 11+
- ✅ Edge 12+
- ✅ Mobile Safari (iOS 11+)
- ✅ Chrome Mobile (Android 5+)

---

## Performance Optimization

### Scanner Configuration
```javascript
const config = {
  fps: 10,                    // 10 frames per second
  qrbox: { width: 300, height: 300 },  // Scan area
  formatsToSupport: [...]     // Multiple formats
};
```

### Camera Selection
```javascript
{ facingMode: "environment" }  // Use back camera
```

---

## Styling Details

### Color Coding
- **Success** (Green): Warranty active, >30 days remaining
- **Warning** (Amber): Expiring soon, ≤30 days remaining
- **Error** (Red): Warranty expired

### Animations
- `fadeIn` - Smooth content transitions
- `slideUp` - Results reveal animation
- `pulse` - Scanner status indicator
- `spin` - Loading spinner

### Dark Mode
Automatic theme adaptation with `[data-theme="dark"]` selector

---

## Testing Checklist

- [ ] Camera opens successfully
- [ ] QR code scanning works
- [ ] Barcode scanning works
- [ ] Manual input validates correctly
- [ ] Valid warranty displays correctly
- [ ] Expired warranty displays correctly
- [ ] Device not found error shows
- [ ] No warranty record error shows
- [ ] Days remaining calculation is accurate
- [ ] Progress bar displays correctly
- [ ] Mobile responsive layout works
- [ ] Dark mode styling applies
- [ ] Scanner stops when modal closes
- [ ] Multiple scans work without refresh

---

## Future Enhancements

### Potential Additions
1. **Bulk Scanning Mode** - Scan multiple devices in sequence
2. **Export to PDF** - Generate warranty report
3. **Email Notification** - Send expiring warranty alerts
4. **Warranty Renewal** - Direct link to renewal process
5. **Service History** - Show repair history with warranty
6. **QR Code Generation** - Print warranty QR stickers
7. **Offline Mode** - Cache warranty data for offline validation
8. **Multi-language Support** - Localized validation messages

---

## Troubleshooting

### Camera Not Working
1. Check browser permissions
2. Ensure HTTPS or localhost
3. Try different browser
4. Use manual input as fallback

### Scan Not Detecting
1. Ensure good lighting
2. Hold steady
3. Adjust distance (6-12 inches)
4. Clean camera lens
5. Use manual input if barcode damaged

### Image Upload Not Working
**Problem**: Can't upload image or upload fails
**Solution**:
- Check file size (must be under 10MB)
- Verify file format (JPG, PNG, GIF, BMP, WebP)
- Ensure browser has file access permissions
- Try compressing large images
- Use different image editing software

### Barcode Not Detected in Image
**Problem**: Upload succeeds but no barcode found
**Solution**:
- Use higher resolution image
- Ensure barcode is clearly visible
- Crop image to focus on barcode
- Adjust image brightness/contrast
- Avoid images with filters or effects
- Check barcode isn't damaged or obscured
- Try camera scanner instead
- Use manual entry as fallback

### Upload Takes Too Long
**Problem**: Image upload or processing is slow
**Solution**:
- Compress image file before uploading
- Use JPEG format instead of PNG
- Reduce image resolution to 1920px or less
- Check internet connection speed
- Close unnecessary browser tabs

### Validation Fails
1. Check internet connection
2. Verify device is registered
3. Ensure warranty record exists
4. Contact admin for registration

---

## Support

For technical support or feature requests, contact:
**Brains Infinite Innovations Inc.**

---

*Last Updated: September 14, 2026*
*Version: 1.0.0*
