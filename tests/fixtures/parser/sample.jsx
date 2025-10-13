/**
 * Sample JSX file for testing parser
 * Contains React components with hooks
 */

import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';

// Functional component
export function Counter({ initial = 0 }) {
  const [count, setCount] = useState(initial);

  const increment = useCallback(() => {
    setCount(c => c + 1);
  }, []);

  const decrement = () => {
    setCount(count - 1);
  };

  return (
    <div className="counter">
      <button onClick={decrement}>-</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  );
}

Counter.propTypes = {
  initial: PropTypes.number
};

// Class component
export class Timer extends React.Component {
  constructor(props) {
    super(props);
    this.state = { seconds: 0 };
    this.interval = null;
  }

  componentDidMount() {
    this.interval = setInterval(() => {
      this.setState(state => ({ seconds: state.seconds + 1 }));
    }, 1000);
  }

  componentWillUnmount() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  render() {
    return <div>Elapsed: {this.state.seconds}s</div>;
  }
}

// HOC
export function withLogging(Component) {
  return function LoggingComponent(props) {
    console.log('Rendering:', Component.name);
    return <Component {...props} />;
  };
}

export default Counter;
