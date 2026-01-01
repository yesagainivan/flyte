import { render, screen } from '@testing-library/react';
import { Toast, type ToastMessage } from './Toast';
import { vi, describe, it, expect } from 'vitest';

describe('Toast Component', () => {
    it('should not render when message is null', () => {
        render(<Toast message={null} onClose={() => { }} />);
        // Let's search by text or class.
        const toastDiv = document.querySelector('.toast');
        expect(toastDiv).not.toBeInTheDocument();
    });

    it('should render the message when provided', () => {
        const message: ToastMessage = { type: 'success', text: 'Operation successful' };
        render(<Toast message={message} onClose={() => { }} />);

        expect(screen.getByText('Operation successful')).toBeInTheDocument();
        const toastDiv = document.querySelector('.toast-success');
        expect(toastDiv).toBeInTheDocument();
    });

    it('should call onClose after 3 seconds', () => {
        vi.useFakeTimers();
        const onCloseMock = vi.fn();
        const message: ToastMessage = { type: 'info', text: 'Info message' };

        render(<Toast message={message} onClose={onCloseMock} />);

        expect(onCloseMock).not.toHaveBeenCalled();

        // Fast-forward time
        vi.advanceTimersByTime(3000);

        expect(onCloseMock).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
