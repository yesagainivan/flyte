import { useEffect } from 'react';
import './Toast.css';

export interface ToastMessage {
    type: 'success' | 'error' | 'info';
    text: string;
}

interface ToastProps {
    message: ToastMessage | null;
    onClose: () => void;
}

export function Toast({ message, onClose }: ToastProps) {
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => {
                onClose();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [message, onClose]);

    if (!message) return null;

    return (
        <div className={`toast toast-${message.type}`}>
            {message.text}
        </div>
    );
}
