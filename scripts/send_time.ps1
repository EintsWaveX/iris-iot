<#
  send_time.ps1

  Sends the current Windows clock to one or more ESP32 boards over Serial, in
  the "YYYY-MM-DD HH:MM:SS.mmm" format that syncTimeFromSerial() (present in
  every Module 1 and Module 4 sketch) expects. Run it right after the sketch
  reaches setup(), since a board only waits ~10 seconds for the time before
  falling back to time-since-boot.

  WHY THE MILLISECONDS MATTER: the practicum subtracts the sender's timestamp
  from the receiver's timestamp to obtain a one-way delay. If the two boards
  were synced to whole seconds only, they could disagree by up to a full second
  and that subtraction would be meaningless. Sending .mmm brings both boards
  onto the same wall clock to within a few milliseconds.

  ALWAYS SYNC BOTH BOARDS FROM THIS SAME PC, in one run. Two different PCs have
  two different clocks, and their timestamps cannot be compared.

  Usage:
    .\send_time.ps1                        # lists available COM ports
    .\send_time.ps1 -Port COM5             # sends the time to one board
    .\send_time.ps1 -Port COM5,COM7        # sends to both boards, one after the other
    .\send_time.ps1 -Port COM5 -Baud 9600
#>
param(
  [string[]]$Port,
  [int]$Baud = 115200
)

if (-not $Port) {
  $ports = [System.IO.Ports.SerialPort]::GetPortNames()
  if (-not $ports) {
    Write-Host "No COM ports found. Plug in the board and try again."
    exit 1
  }
  Write-Host "Available COM ports: $($ports -join ', ')"
  Write-Host "Re-run with -Port <name>, e.g.: .\send_time.ps1 -Port $($ports[0])"
  if ($ports.Count -ge 2) {
    Write-Host "For a two-board module, sync both at once: .\send_time.ps1 -Port $($ports[0]),$($ports[1])"
  }
  exit 0
}

function Send-TimeToPort {
  param([string]$Name, [int]$BaudRate)

  $serial = New-Object System.IO.Ports.SerialPort $Name, $BaudRate, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
  $serial.NewLine = "`n"
  $serial.ReadTimeout = 3000

  try {
    $serial.Open()
  } catch {
    Write-Host "Could not open $Name : $($_.Exception.Message)"
    return
  }

  # Opening the port resets most ESP32 boards (DTR/RTS toggle); give the sketch
  # time to reboot and reach syncTimeFromSerial()'s wait loop before sending.
  Start-Sleep -Seconds 2

  # Read the clock as late as possible, immediately before the write, so the
  # value on the wire is as close to "now" as this script can make it.
  $now = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff")
  $serial.WriteLine($now)
  Write-Host "Sent '$now' to $Name."

  Start-Sleep -Milliseconds 500
  try {
    while ($true) {
      Write-Host "  [$Name] $($serial.ReadLine())"
    }
  } catch [System.TimeoutException] {
    # No more board output within the timeout; that's expected once the board
    # finishes printing its sync confirmation.
  }

  $serial.Close()
}

foreach ($name in $Port) {
  Send-TimeToPort -Name $name -BaudRate $Baud
}

if ($Port.Count -ge 2) {
  Write-Host ""
  Write-Host "Both boards are now on this PC's clock. Their Serial Monitor"
  Write-Host "timestamps can be subtracted to obtain a one-way delay."
}
