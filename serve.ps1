$port = 8080
$root = "c:\Users\iblish\FALLINGSUN"
$endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, $port)
$listener = New-Object System.Net.Sockets.TcpListener($endpoint)
$listener.Start()

Write-Output "[VITAL-X] Server listening on:"
Write-Output "  -> Localhost: http://localhost:$port/"
Write-Output "  -> LAN / Wi-Fi: http://172.16.113.78:$port/"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/manifest+json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".ico"  = "image/x-icon"
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      if (-not [string]::IsNullOrEmpty($requestLine)) {
        while ($true) {
          $headerLine = $reader.ReadLine()
          if ([string]::IsNullOrEmpty($headerLine)) { break }
        }
        $parts = $requestLine.Split(' ')
        $rawPath = if ($parts.Length -ge 2) { $parts[1].Split('?')[0] } else { "/" }
        $relPath = [System.Uri]::UnescapeDataString($rawPath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($relPath)) {
          $relPath = "index.html"
        }
        $filePath = Join-Path $root ($relPath -replace '/', '\')

        if (Test-Path $filePath -PathType Leaf) {
          $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
          $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
          $bodyBytes = [System.IO.File]::ReadAllBytes($filePath)
          $headerStr = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bodyBytes.Length)`r`nService-Worker-Allowed: /`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
          $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerStr)
          $stream.Write($headerBytes, 0, $headerBytes.Length)
          $stream.Write($bodyBytes, 0, $bodyBytes.Length)
        } else {
          $notFound = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 404 Not Found`r`nContent-Length: 0`r`nConnection: close`r`n`r`n")
          $stream.Write($notFound, 0, $notFound.Length)
        }
      }
    } catch {} finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
