param(
    [Parameter(Mandatory = $true)][string]$SourceManifest,
    [Parameter(Mandatory = $true)][string]$Request,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [string]$MavenRepository = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceFile = (Resolve-Path -LiteralPath $SourceManifest).Path
$requestFile = (Resolve-Path -LiteralPath $Request).Path
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
$resolvedMavenRepository = if ($MavenRepository) { [IO.Path]::GetFullPath($MavenRepository) } else { '' }
if (Test-Path -LiteralPath $outputRoot) { throw 'Choose a new output directory; existing results are never overwritten.' }
$mavenSettings = (Resolve-Path -LiteralPath (Join-Path $projectRoot '.mvn/cimet-settings.xml')).Path
$dependencyLock = Get-Content -LiteralPath (Join-Path $projectRoot 'cimet-dependency.lock.json') -Raw | ConvertFrom-Json
foreach ($serviceName in @('backend', 'componentanalysis')) {
    $provenancePath = Join-Path $projectRoot "$serviceName/vendor/cimet-dependency.json"
    if (-not (Test-Path -LiteralPath $provenancePath)) { throw 'Prepare released parser assets first: python scripts/prepare_cimet_runtime.py' }
    $provenance = Get-Content -LiteralPath $provenancePath -Raw | ConvertFrom-Json
    foreach ($field in @('repositoryId', 'repositoryUrl', 'groupId', 'artifactId', 'version', 'jarSha256', 'pomSha256')) {
        if ($provenance.artifact.$field -ne $dependencyLock.maven.$field) {
            throw "Released CIMET metadata for $serviceName does not match the dependency lock; rerun scripts/prepare_cimet_runtime.py"
        }
    }
    if ($provenance.release.commit -ne $dependencyLock.release.commit -or
        $provenance.runtime.sha256 -ne $dependencyLock.runtime.sha256) {
        throw "Released parser assets for $serviceName do not match the dependency lock; rerun scripts/prepare_cimet_runtime.py"
    }
}
New-Item -ItemType Directory -Path $outputRoot | Out-Null
$savedManifest = $env:CIMET_LOCAL_SOURCES_FILE
$savedAdapter = $env:CIMET_JAVASCRIPT_ADAPTER
$env:CIMET_LOCAL_SOURCES_FILE = $sourceFile
try {
    foreach ($serviceName in @('backend', 'componentanalysis')) {
        $serviceRoot = Join-Path $projectRoot $serviceName
        Push-Location $serviceRoot
        try {
            $mavenArguments = @('-s',$mavenSettings,'-q','-DskipTests','package','dependency:build-classpath','-Dmdep.outputFile=target/runtime-classpath.txt')
            if ($resolvedMavenRepository) { $mavenArguments = @("-Dmaven.repo.local=$resolvedMavenRepository") + $mavenArguments }
            & mvn @mavenArguments *> (Join-Path $outputRoot "$serviceName-build.log")
            if ($LASTEXITCODE -ne 0) { throw "Build failed for $serviceName; see the output log." }
            $verificationArguments = @((Join-Path $projectRoot 'scripts/verify_cimet_dependency.py'), '--service', $serviceName)
            if ($resolvedMavenRepository) { $verificationArguments += @('--maven-repository', $resolvedMavenRepository) }
            & python @verificationArguments *> (Join-Path $outputRoot "$serviceName-dependency.log")
            if ($LASTEXITCODE -ne 0) { throw "Published CIMET verification failed for $serviceName; see the dependency log." }
            $classpath = (Join-Path $serviceRoot 'target/classes') + [IO.Path]::PathSeparator + (Get-Content 'target/runtime-classpath.txt' -Raw).Trim()
            $env:CIMET_JAVASCRIPT_ADAPTER = Join-Path $serviceRoot 'vendor/javascript'
            if ($serviceName -eq 'backend') {
                $mainClass = 'edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir.LocalExtractionCli'
                $outputFile = Join-Path $outputRoot 'native-ir.json'
            } else {
                $mainClass = 'edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.LocalComponentCli'
                $outputFile = Join-Path $outputRoot 'component-result.json'
            }
            & java -Xmx768m -cp $classpath $mainClass --request $requestFile --output $outputFile *> (Join-Path $outputRoot "$serviceName-analysis.log")
            if ($LASTEXITCODE -ne 0) { throw "Analysis failed for $serviceName; see the output log." }
            Write-Output "$serviceName analysis complete: $outputFile"
        } finally { Pop-Location }
    }
    Copy-Item -LiteralPath $requestFile -Destination (Join-Path $outputRoot 'request.json')
    Copy-Item -LiteralPath (Join-Path $projectRoot 'backend/vendor/cimet-dependency.json') -Destination (Join-Path $outputRoot 'cimet-dependency.json')
    Copy-Item -LiteralPath (Join-Path $projectRoot 'backend/vendor/security/aridnova-security-source.json') -Destination (Join-Path $outputRoot 'aridnova-security-source.json')
} finally {
    $env:CIMET_LOCAL_SOURCES_FILE = $savedManifest
    $env:CIMET_JAVASCRIPT_ADAPTER = $savedAdapter
}
