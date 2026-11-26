package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.ComponentIndex;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.EndpointIndex;

/** The same extraction result is used by the HTTP persistence path and the offline runner. */
public record IndexBundle(EndpointIndex endpointIndex, ComponentIndex componentIndex) { }
