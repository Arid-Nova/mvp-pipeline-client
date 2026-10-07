using '../main.bicep'
extends '_root.bicepparam'

param environment = 'prod'
param tags = {
  team: 'arid-nova'
  persistent: 'true'
}
