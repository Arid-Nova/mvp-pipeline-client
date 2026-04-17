package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class DeltaRequestModel extends IRRequestModel {

    public SystemRepository[] comparingRepositories;
    
}
