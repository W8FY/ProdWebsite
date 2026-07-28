param(
    [string]$WorkbookPath = "source/membership/W8FY-Membership-List-2026-With-Officers-1.xlsx",
    [string]$OutputPath = "static/data/member-roster.json"
)

$ErrorActionPreference = "Stop"

function Get-InlineText {
    param($InlineString)

    if ($null -eq $InlineString) {
        return ""
    }

    $parts = New-Object System.Collections.Generic.List[string]

    if ($InlineString.t) {
        foreach ($node in @($InlineString.t)) {
            if ($null -ne $node.'#text') {
                $parts.Add([string]$node.'#text')
            } else {
                $parts.Add([string]$node)
            }
        }
    }

    if ($InlineString.r) {
        foreach ($run in @($InlineString.r)) {
            foreach ($node in @($run.t)) {
                if ($null -ne $node.'#text') {
                    $parts.Add([string]$node.'#text')
                } else {
                    $parts.Add([string]$node)
                }
            }
        }
    }

    return ($parts -join "").Trim()
}

function Get-SharedString {
    param($SharedItem)

    if ($null -eq $SharedItem) {
        return ""
    }

    if ($SharedItem.t) {
        return ((@($SharedItem.t) | ForEach-Object {
            if ($null -ne $_.'#text') { [string]$_.'#text' } else { [string]$_ }
        }) -join "").Trim()
    }

    if ($SharedItem.r) {
        return ((@($SharedItem.r) | ForEach-Object {
            if ($_.t.'#text') { [string]$_.t.'#text' } else { [string]$_.t }
        }) -join "").Trim()
    }

    return ""
}

function Get-CellValue {
    param($Cell, [object[]]$SharedStrings)

    if ($Cell.t -eq "inlineStr") {
        return Get-InlineText $Cell.is
    }

    $raw = [string]$Cell.v
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $null
    }

    if ($Cell.t -eq "s") {
        return Get-SharedString $SharedStrings[[int]$raw]
    }

    return $raw
}

function Convert-ExcelDate {
    param($Value)

    if ([string]::IsNullOrWhiteSpace([string]$Value)) {
        return $null
    }

    try {
        $serial = [double]$Value
        return ([datetime]"1899-12-30").AddDays($serial).ToString("yyyy-MM-dd")
    } catch {
        return $null
    }
}

function Get-ColumnName {
    param([string]$CellRef)
    return ($CellRef -replace "\d", "")
}

$workbookFullPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $WorkbookPath))
if (-not (Test-Path -LiteralPath $workbookFullPath)) {
    throw "Workbook not found: $workbookFullPath"
}

$systemTemp = [System.IO.Path]::GetTempPath()
$tempRoot = Join-Path $systemTemp ("w8fy-member-roster-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tempRoot | Out-Null

try {
    $zipPath = Join-Path $tempRoot "workbook.zip"
    Copy-Item -LiteralPath $workbookFullPath -Destination $zipPath
    Expand-Archive -LiteralPath $zipPath -DestinationPath $tempRoot

    $sharedStrings = @()
    $sharedPath = Join-Path $tempRoot "xl/sharedStrings.xml"
    if (Test-Path -LiteralPath $sharedPath) {
        [xml]$sharedXml = Get-Content -LiteralPath $sharedPath
        $sharedStrings = @($sharedXml.sst.si)
    }

    $sheetPath = Join-Path $tempRoot "xl/worksheets/sheet1.xml"
    [xml]$sheetXml = Get-Content -LiteralPath $sheetPath

    $headers = @{}
    $members = New-Object System.Collections.Generic.List[object]
    $currentYear = (Get-Date).Year

    foreach ($row in @($sheetXml.worksheet.sheetData.row)) {
        $rowIndex = [int]$row.r
        $values = @{}

        foreach ($cell in @($row.c)) {
            $column = Get-ColumnName $cell.r
            $value = Get-CellValue $cell $sharedStrings

            if ($rowIndex -eq 1) {
                if (-not [string]::IsNullOrWhiteSpace([string]$value)) {
                    $headers[$column] = ([string]$value).Trim().ToUpperInvariant()
                }
            } else {
                if ($headers.ContainsKey($column)) {
                    $values[$headers[$column]] = $value
                }
            }
        }

        if ($rowIndex -eq 1) {
            continue
        }

        $last = ([string]$values["LAST"]).Trim()
        $first = ([string]$values["FIRST"]).Trim()
        $call = ([string]$values["CALL"]).Trim()

        if ([string]::IsNullOrWhiteSpace($call)) {
            continue
        }

        $year = $null
        if (-not [string]::IsNullOrWhiteSpace([string]$values["YEAR"])) {
            try {
                $year = [int][double]$values["YEAR"]
            } catch {
                $year = $null
            }
        }

        $arrlRaw = ([string]$values["ARRL"]).Trim()
        $officer = ([string]$values["POSITION"]).Trim()

        $members.Add([ordered]@{
            name = (($first, $last) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join " "
            lastName = $last
            call = $call
            paidThrough = $year
            paid = ($null -ne $year -and $year -ge $currentYear)
            arrl = (-not [string]::IsNullOrWhiteSpace($arrlRaw) -and $arrlRaw -ne "0")
            officer = $officer
        })
    }

    $sortedMembers = $members | Sort-Object @{ Expression = { $_["lastName"] }; Ascending = $true }, @{ Expression = { $_["name"] }; Ascending = $true }
    $payload = [ordered]@{
        generatedAt = (Get-Date).ToString("o")
        sourceWorkbook = (Split-Path -Leaf $WorkbookPath)
        members = @($sortedMembers)
    }

    $outputFullPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
    $outputDirectory = Split-Path -Parent $outputFullPath
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    $payload | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $outputFullPath -Encoding UTF8
    Write-Host "Exported $($sortedMembers.Count) members to $outputFullPath"
} finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath($tempRoot)
    $resolvedSystemTemp = [System.IO.Path]::GetFullPath($systemTemp)
    if ($resolvedTemp.StartsWith($resolvedSystemTemp, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
