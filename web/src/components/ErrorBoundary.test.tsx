import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import { describe, it, expect, vi } from 'vitest';

// Component that throws an error to test the boundary
const ThrowError = () => {
    throw new Error('Test Error');
};

describe('ErrorBoundary Component', () => {
    it('should render children when there is no error', () => {
        render(
            <ErrorBoundary>
                <div>Safe Content</div>
            </ErrorBoundary>
        );
        expect(screen.getByText('Safe Content')).toBeInTheDocument();
    });

    it('should catch errors and display fallback UI', () => {
        // Prevent console.error from cluttering the test output
        const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => { });

        render(
            <ErrorBoundary>
                <ThrowError />
            </ErrorBoundary>
        );

        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByText('Test Error')).toBeInTheDocument();

        consoleErrorMock.mockRestore();
    });

    it('should reload page when reload button is clicked', () => {
        const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => { });
        // Mock window.location.reload
        // Note: window.location properties are read-only in JSDOM usually, but reload is a method.
        // We might need to define it if not present, or spy on it.
        const originalLocation = window.location;

        // JSDOM implements location.reload but it might just print a "not implemented" error or do nothing.
        // The best way to test this is usually defining a mock reload function.
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, reload: vi.fn() },
        });

        render(
            <ErrorBoundary>
                <ThrowError />
            </ErrorBoundary>
        );

        const reloadButton = screen.getByText('Reload Application');
        fireEvent.click(reloadButton);

        expect(window.location.reload).toHaveBeenCalled();

        // Cleanup
        Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
        consoleErrorMock.mockRestore();
    });
});
