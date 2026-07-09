package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class IRByNameRequest {

    public String systemName;

    public int limit = 4;
}
