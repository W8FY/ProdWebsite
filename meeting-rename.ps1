# Set the root path
$RootPath = "\Users\justinbrant\Repos\w8fy.brantlab.com\static\meetings"

# File types to process
$Extensions = @("*.pdf", "*.htm", "*.html", "*.docx")

# Loop through each extension type
foreach ($Ext in $Extensions) {
    Get-ChildItem -Path $RootPath -Filter $Ext -Recurse | ForEach-Object {
        $File = $_
        $FileName = $File.BaseName
        $Extension = $File.Extension
        $Directory = $File.DirectoryName

        # Regex to match dates like "12 7 2013" or "10 7, 2017"
        if ($FileName -match "^(.*?)(\d{1,2})[ _](\d{1,2})(?:,)?[ _](\d{4})(.*)$") {
            $Prefix = $Matches[1].Trim()
            $Month = [int]$Matches[2]
            $Day = [int]$Matches[3]
            $Year = [int]$Matches[4]
            $Suffix = $Matches[5].Trim()

            # Convert to long date format
            try {
                $Date = Get-Date -Year $Year -Month $Month -Day $Day
                $FormattedDate = $Date.ToString("MMMM d, yyyy")
            }
            catch {
                Write-Host "❌ Date parse failed for $FileName"
                return
            }

            # Build new file name
            $NewName = "$Prefix $FormattedDate $Suffix".Trim() -replace "  +", " "
            $NewFullPath = Join-Path $Directory ($NewName + $Extension)

            # Rename
            Write-Host "✅ Renaming:`n  From: $($File.FullName)`n  To:   $NewFullPath`n"
            Rename-Item -Path $File.FullName -NewName $NewFullPath
        }
    }
}
