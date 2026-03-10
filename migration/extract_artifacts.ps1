# extract_artifacts.ps1
$dbPath = "C:\Users\senoi\Desktop\NEW SAHS Museum Inventory Membership Database 2025.accdb"
$outputJson = "migration/artifacts.json"
$assetsDir = "migration/assets"

if (-not (Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir -Force }

$dbe = New-Object -ComObject "DAO.DBEngine.120"
try {
    $db = $dbe.OpenDatabase($dbPath)
    $rs = $db.OpenRecordset("SELECT * FROM [TblMuseum Artifact Inventory]")
    $artifacts = @()

    while (-not $rs.EOF) {
        $vId = $rs.Fields("ID").Value
        $vTitle = $rs.Fields("Title").Value
        $vDesc = $rs.Fields("Description").Value
        $vDate = $rs.Fields("Aquired Date").Value
        $vCreator = $rs.Fields("Artist/Author").Value
        $vDonor = $rs.Fields("Donated By").Value
        $vLoc = $rs.Fields("Current Location").Value
        $vType = $rs.Fields("Type").Value
        $vNotes = $rs.Fields("Notes").Value
        
        $vAttachments = @()
        try {
            $vAttachRs = $rs.Fields("Attachments").Value
            while (-not $vAttachRs.EOF) {
                $vFileName = $vAttachRs.Fields("FileName").Value
                $vSafeName = "$vId" + "_" + "$vFileName"
                $vFilePath = Join-Path $assetsDir $vSafeName
                $vAttachRs.Fields("FileData").SaveToFile($vFilePath)
                $vAttachments += $vSafeName
                $vAttachRs.MoveNext()
            }
        } catch { }

        $vDateStr = $null
        if ($vDate -ne $null) {
            try {
                $vDateStr = [DateTime]::Parse($vDate.ToString()).ToString("yyyy-MM-dd")
            } catch {
                $vDateStr = $vDate.ToString()
            }
        }

        $vArtifact = @{
            access_id = $vId
            title = $vTitle
            description = $vDesc
            date = $vDateStr
            creator = $vCreator
            donor = $vDonor
            museum_location = $vLoc
            artifact_type = $vType
            notes = $vNotes
            local_attachments = $vAttachments
        }
        $artifacts += $vArtifact
        $rs.MoveNext()
    }
    $artifacts | ConvertTo-Json -Depth 10 | Out-File $outputJson -Encoding utf8
    Write-Host "Success: Extracted $($artifacts.Count) artifacts."
} catch { Write-Error $_ } finally { if ($db) { $db.Close() } }
