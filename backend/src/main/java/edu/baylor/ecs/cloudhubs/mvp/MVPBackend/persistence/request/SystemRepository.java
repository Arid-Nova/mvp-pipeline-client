package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SystemRepository {

    public RepoBranch repoBranchPair;

    public String commitID;

    /** Optional language hint; omitted/auto scans all registered languages per file. */
    public String language;

    /** JavaScript boundaries are declared explicitly: backend or frontend. */
    public String componentKind;

    public String componentName;
    
}
