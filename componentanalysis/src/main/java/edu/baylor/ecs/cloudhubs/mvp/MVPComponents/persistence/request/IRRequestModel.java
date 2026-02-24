package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request;

import lombok.Getter;
import lombok.Setter;

import java.util.Map;

@Getter
@Setter
public class IRRequestModel {

    public String systemName;

    public SystemRepository[] systemRepositories;

    public Integer defaultRolePriority;

    public Map<String, Integer> rolePriority;
}

