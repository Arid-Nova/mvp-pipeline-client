import React from "react";
import { render, screen } from "@testing-library/react";
import ChatComposer from "./ChatComposer";

const renderComposer = (props: { submitDisabled?: boolean; busy?: boolean }) =>
    render(
        <ChatComposer
            value="Analyze this system"
            onChange={jest.fn()}
            onSubmit={jest.fn()}
            {...props}
        />
    );

describe("ChatComposer", () => {
    it("disables Send without a spinner when submission is unavailable", () => {
        renderComposer({ submitDisabled: true });

        const submit = screen.getByTestId("chatbot-submit");
        expect(submit).toBeDisabled();
        expect(submit.querySelector(".animate-spin")).toBeNull();
    });

    it("shows the spinner only while actively busy", () => {
        renderComposer({ busy: true });

        const submit = screen.getByTestId("chatbot-submit");
        expect(submit).toBeDisabled();
        expect(submit.querySelector(".animate-spin")).toBeInTheDocument();
    });
});
