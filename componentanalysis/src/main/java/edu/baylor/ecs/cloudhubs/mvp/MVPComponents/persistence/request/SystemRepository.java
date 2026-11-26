package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SystemRepository {
    public RepoBranch repoBranchPair;
    public String commitID;
    /** Explicit source adapter; omitted means the existing Java path. */
    public String language;
    /** Required for JavaScript: backend or frontend (never inferred as a service). */
    public String componentKind;
    public String componentName;
}
