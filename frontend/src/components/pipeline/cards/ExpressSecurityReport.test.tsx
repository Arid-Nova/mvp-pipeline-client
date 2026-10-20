import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
