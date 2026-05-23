package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.Date;

@Getter
@AllArgsConstructor
public class StoredIrPayload {
    private final String id;
    private final String systemName;
    private final Date createDate;
    private final Date modifyDate;
    private final JsonNode payload;
}
