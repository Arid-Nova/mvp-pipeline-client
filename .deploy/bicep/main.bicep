targetScope = 'subscription'

param project string
param environment string
param location string = 'westus2'
param tags object = {}
param deploymentTimestamp string = utcNow()

var nsgName = '${project}-${environment}-nsg'
var nsgDeploymentName = 'deploying-${nsgName}-${deploymentTimestamp}'

resource demoResourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: '${project}-${environment}-rg'
  location: location
  tags: tags
}

module nsg './module/mvpPipelineNsg.bicep' = {
  name: nsgDeploymentName
  scope: demoResourceGroup
  params: {
    nsgName: nsgName
    location: demoResourceGroup.location
    tags: tags
  }
}
