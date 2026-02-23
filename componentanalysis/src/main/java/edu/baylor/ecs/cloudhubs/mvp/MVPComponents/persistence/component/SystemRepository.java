package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.component;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SystemRepository {
    public RepoBranch repoBranchPair;
    public String commitID;
}
