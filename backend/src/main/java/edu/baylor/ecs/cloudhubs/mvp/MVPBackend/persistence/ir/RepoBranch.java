package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class RepoBranch {
    public String repositoryURL;
    public String branchName;
}
