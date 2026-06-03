param(
  [string]$Src = 'G:\My Drive\QRIS Statis G A R A G E MINUMAN - 2026529121510.pdf',
  [string]$Dst = 'D:\GARAGEFIX\G A R A G E\public\payments\qris-garage.png',
  [int]$Page = 0,
  [int]$Width = 1400
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]

$asTaskMethods = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod }
$asTaskOp = $asTaskMethods | Where-Object {
  $_.GetParameters()[0].ParameterType.GetGenericTypeDefinition().Name -like 'IAsyncOperation*'
} | Select-Object -First 1
$asTaskAction = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and -not $_.IsGenericMethod } |
  Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } |
  Select-Object -First 1

function Await-Operation($op, [Type]$resultType) {
  $generic = $asTaskOp.MakeGenericMethod($resultType)
  $task = $generic.Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  return $task.Result
}

function Await-Action($op) {
  $task = $asTaskAction.Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
}

if (-not (Test-Path $Src)) { throw "Source PDF not found: $Src" }
$dstDir = Split-Path -Parent $Dst
if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }

$storageFile = Await-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Src)) ([Windows.Storage.StorageFile])
$pdfDoc      = Await-Operation ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($storageFile)) ([Windows.Data.Pdf.PdfDocument])

Write-Output "PDF pages: $($pdfDoc.PageCount)"
if ($Page -ge $pdfDoc.PageCount) { throw "Page $Page out of range" }

$pdfPage = $pdfDoc.GetPage([uint32]$Page)
$opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
$opts.DestinationWidth = [uint32]$Width

$stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
Await-Action $pdfPage.RenderToStreamAsync($stream, $opts)

$decoder = Await-Operation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$pixelData = Await-Operation $decoder.GetPixelDataAsync() ([Windows.Graphics.Imaging.PixelDataProvider])
$pixels = $pixelData.DetachPixelData()
$w = $decoder.PixelWidth
$h = $decoder.PixelHeight
Write-Output "Decoded $w x $h px, $($pixels.Length) bytes (BGRA8)"

# Encode to PNG using System.Drawing
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap([int]$w, [int]$h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$bd = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# WinRT pixel data is BGRA, GDI+ Format32bppArgb is also BGRA in memory — direct copy works
[System.Runtime.InteropServices.Marshal]::Copy($pixels, 0, $bd.Scan0, $pixels.Length)
$bmp.UnlockBits($bd)
$bmp.Save($Dst, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output "Saved: $Dst ($((Get-Item $Dst).Length) bytes)"
