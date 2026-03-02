package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class IRRequestModel {

    public String id;

    public String systemName;

    public SystemRepository[] systemRepositories;
}

