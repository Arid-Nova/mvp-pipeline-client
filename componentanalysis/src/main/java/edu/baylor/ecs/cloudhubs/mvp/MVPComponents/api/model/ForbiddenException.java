package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.model;

public class ForbiddenException extends IllegalArgumentException {
    public ForbiddenException(String s) {
        super(s);
    }
}
