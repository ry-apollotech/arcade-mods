param([string]$Deck, [string]$OutDir)
# Export every slide of $Deck as PNG into $OutDir using PowerPoint (read-only open).
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Get-ChildItem $OutDir -Filter *.PNG | Remove-Item -Force
$pp = New-Object -ComObject PowerPoint.Application
try {
    $p = $pp.Presentations.Open($Deck, $true, $false, $false)  # ReadOnly, Untitled=false, WithWindow=false
    $i = 1
    foreach ($s in $p.Slides) {
        $s.Export((Join-Path $OutDir ("slide-{0:D2}.png" -f $i)), "PNG", 1600, 900)
        $i++
    }
    $p.Close()
    Write-Output "exported $($i-1) slides"
} finally {
    $pp.Quit()
}
