import { render, screen } from '@testing-library/react';

describe('sanity test', () => {
  it('renders hello vitest', () => {
    render(<div>Hello Vitest</div>);
    expect(screen.getByText('Hello Vitest')).toBeInTheDocument();
  });
});
