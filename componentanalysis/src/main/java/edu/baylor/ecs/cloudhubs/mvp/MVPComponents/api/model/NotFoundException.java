package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.model;

public class NotFoundException extends IllegalArgumentException {
    public NotFoundException(String error) {
        super(error);
    }
}
