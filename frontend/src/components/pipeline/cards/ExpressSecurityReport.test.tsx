import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ExpressSecurityReport } from './ExpressSecurityReport';

const report = {
    status: 'partial',
    findings: [{ id: 'one', ruleId: 'ROLE_FALLTHROUGH', title: 'Role check falls through', severity: 'medium',
        classification: 'review-candidate', location: { file: 'auth.js', line: 8 }, evidence: [{ message: 'next follows denial' }],
        recommendation: 'Check termination of the denied branch.' }],
    endpoints: [{ endpointId: 'route-1', method: 'POST', path: '/records/:id', location: { file: 'routes.js', line: 4 },
        authentication: { status: 'unknown' }, roleChecks: [], ownershipChecks: [], executionPaths: [{ outcome: 'unknown' }] }],
    coverage: { endpointRegistrations: 1 }, limitations: ['Dynamic dispatch is unresolved.']
};

test('keeps partial and candidate status visible and exposes endpoint uncertainty', () => {
    render(<ExpressSecurityReport report={report} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Partial source analysis/)).toBeVisible();
    expect(screen.getByText('medium · review-candidate')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Endpoint checks and paths' }));
    expect(screen.getByText('POST /records/:id')).toBeVisible();
    expect(screen.getByText(/Authentication: unknown/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Filter security results'), { target: { value: 'unrelated' } });
    expect(screen.getByText(/This is not a security pass/)).toBeVisible();
});

test('renders source text safely and supports closing the report', () => {
    const close = jest.fn();
    render(<ExpressSecurityReport report={{ ...report, findings: [{ ...report.findings[0], title: '<script>danger()</script>' }] }} onClose={close} />);
    expect(screen.getByText('<script>danger()</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalledTimes(1);
});

const ReportHarness = () => {
    const [open, setOpen] = React.useState(false);
    return <>
        <button onClick={() => setOpen(true)}>Open report</button>
        <button>Background control</button>
        {open && <ExpressSecurityReport report={report} onClose={() => setOpen(false)} />}
    </>;
};

test('focuses the report initially and contains forward and reverse keyboard navigation', () => {
    render(<ReportHarness />);
    act(() => userEvent.click(screen.getByRole('button', { name: 'Open report' })));
    const close = screen.getByRole('button', { name: 'Close' });
    const last = screen.getByText('Coverage and limitations');
    expect(close).toHaveFocus();

    act(() => userEvent.tab({ shift: true }));
    expect(last).toHaveFocus();
    act(() => userEvent.tab());
    expect(close).toHaveFocus();
    act(() => userEvent.tab());
    expect(screen.getByRole('button', { name: 'Findings' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Background control' })).not.toHaveFocus();
});

test.each(['Escape', 'Close', 'backdrop'])('restores opener focus after closing by %s', method => {
    render(<ReportHarness />);
    const opener = screen.getByRole('button', { name: 'Open report' });
    act(() => userEvent.click(opener));
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    if (method === 'Escape') {
        act(() => userEvent.tab());
        act(() => userEvent.keyboard('{Escape}'));
    } else if (method === 'Close') {
        act(() => userEvent.click(screen.getByRole('button', { name: 'Close' })));
    } else {
        fireEvent.click(screen.getByRole('dialog').parentElement!);
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
});
