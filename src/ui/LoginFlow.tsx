// src/ui/LoginFlow.tsx
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export interface LoginFlowProps {
  providerName: string;
  onLogin: () => Promise<void>;
  onComplete: () => void;
  onError: (error: Error) => void;
}


export function LoginFlow({ providerName, onLogin, onComplete, onError }: LoginFlowProps) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const performLogin = async () => {
      try {
        setMessage(`Authenticating with ${providerName}...`);
        await onLogin();
        setStatus('success');
        setMessage(`✓ Successfully authenticated with ${providerName}`);
        
        setTimeout(() => {
          onComplete();
        }, 1500);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setStatus('error');
        setMessage(`✗ Error: ${err.message}`);
        onError(err);
      }
    };

    void performLogin();
  }, [providerName, onLogin, onComplete, onError]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        {status === 'loading' && <Spinner type="dots" />}
        <Text>{message}</Text>
      </Box>
      
      {status === 'loading' && (
        <Text dimColor>
          Please complete authentication in your browser...
        </Text>
      )}
    </Box>
  );
}
