import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ReactDom from 'react-dom';
import { stylesToCss } from 'style-utils';

import { dataToArray, objectEqual } from './util';
import Tween from './Tween';
import ticker from './ticker';

function noop() {
}

const perFrame = Math.round(1000 / 60);
const objectOrArray = PropTypes.oneOfType([PropTypes.object, PropTypes.array]);

class TweenOne extends Component {
  static propTypes = {
    component: PropTypes.any,
    componentProps: PropTypes.any,
    animation: objectOrArray,
    children: PropTypes.any,
    style: PropTypes.object,
    paused: PropTypes.bool,
    reverse: PropTypes.bool,
    reverseDelay: PropTypes.number,
    yoyo: PropTypes.bool,
    repeat: PropTypes.number,
    moment: PropTypes.number,
    attr: PropTypes.string,
    onChange: PropTypes.func,
    resetStyleBool: PropTypes.bool,
    updateReStart: PropTypes.bool,
    forcedJudg: PropTypes.object,
  };

  static defaultProps = {
    component: 'div',
    componentProps: {},
    reverseDelay: 0,
    repeat: 0,
    attr: 'style',
    onChange: noop,
    updateReStart: true,
  };
  constructor(props) {
    super(props);
    this.rafID = -1;
    this.moment = props.moment || 0;
    this.startMoment = props.moment || 0;
    this.startFrame = ticker.frame;
    this.paused = props.paused;
    this.reverse = props.reverse;
    this.newMomentAnim = false;
    this.updateAnim = null;
    this.forced = {};
    this.setForcedJudg(props);
  }

  componentDidMount() {
    this.dom = ReactDom.findDOMNode(this);
    if (this.dom && this.dom.nodeName !== '#text') {
      this.start();
    }
  }

  componentWillReceiveProps(nextProps) {
    if (!this.tween && !this.dom) {
      this.updateAnim = 'start';
      return;
    }
    // 跳帧事件 moment;
    const newMoment = nextProps.moment;
    this.newMomentAnim = false;
    if (typeof newMoment === 'number' && newMoment !== this.moment) {
      this.startMoment = newMoment;
      this.startFrame = ticker.frame;
      if (this.rafID === -1 && !nextProps.paused) {
        this.tween.resetAnimData();
        const style = nextProps.style;
        this.dom.setAttribute('style', '');
        if (style) {
          Object.keys(style).forEach(key => {
            this.dom.style[key] = stylesToCss(key, style[key]);
          });
        }
        this.play();
      } else {
        this.newMomentAnim = true;
      }
    }
    // 动画处理
    const newAnimation = nextProps.animation;
    const currentAnimation = this.props.animation;
    const equal = objectEqual(currentAnimation, newAnimation);
    const styleEqual = objectEqual(this.props.style, nextProps.style);
    // 如果 animation 不同， 在下一帧重新动画
    if (!equal) {
      // 在有动画的情况下才可以执行 resetDefaultStyle; 避免无动画时也把 style 刷成默认状态。
      if (nextProps.resetStyleBool && this.tween && this.rafID === -1) {
        this.tween.resetDefaultStyle();
      }
      if (this.rafID !== -1) {
        this.updateAnim = 'update';
      } else if (nextProps.updateReStart) {
        this.startFrame = ticker.frame;
        this.updateAnim = 'start';
      }
      // 只做动画，不做回调处理。。。
      if (this.tween) {
        this.tween.updateAnim = this.updateAnim;
      }
    }

    if (!styleEqual) {
      // 在动画时更改了 style, 作为更改开始数值。
      if (this.rafID !== -1) {
        this.updateStartStyle = true;
      }
    }

    // 暂停倒放
    if (this.paused !== nextProps.paused || this.reverse !== nextProps.reverse) {
      this.paused = nextProps.paused;
      this.reverse = nextProps.reverse;
      if (this.paused) {
        this.cancelRequestAnimationFrame();
      } else if (this.reverse && nextProps.reverseDelay) {
        this.cancelRequestAnimationFrame();
        ticker.timeout(this.restart, nextProps.reverseDelay);
      } else {
        this.restart();
      }
    }

    this.setForcedJudg(nextProps);
  }

  componentDidUpdate() {
    if (!this.dom || this.dom.nodeName !== '#text') {
      this.dom = ReactDom.findDOMNode(this);
    }
    if (this.tween) {
      if (this.updateStartStyle && !this.updateAnim) {
        this.tween.reStart(this.props.style);
        this.updateStartStyle = false;
      }

      if (this.newMomentAnim) {
        this.raf();
      }
    }
    // 样式更新了后再执行动画；
    if (this.updateAnim === 'start' && this.dom && this.dom.nodeName !== '#text') {
      this.start();
    }
  }

  componentWillUnmount() {
    this.cancelRequestAnimationFrame();
  }

  /**
   * @method setForcedJudg
   * @param props
   * QueueAnim 套在组件下面后导至子级变化。
   * <QueueAnim component={Menu} >
   *   <SubMenu key="a" title="导航">
   *     <Item />
   *   </SubMenu>
   * </QueueAnim>
   * rc-Menu 里是以 isXXX 来判断是 rc-Menu 的子级;
   * 如: 用 isSubMenu 来处理 hover 事件
   * 地址: https://github.com/react-component/menu/blob/master/src/MenuMixin.js#L172
   * 暂时方案: 在组件里添加判断用的值。
   */

  setForcedJudg = (props) => {
    Object.keys(this.forced).forEach(key => {
      delete this[key];
      delete this.forced[key];
    });
    if (props.forcedJudg) {
      Object.keys(props.forcedJudg).forEach(key => {
        if (!this[key]) {
          this[key] = props.forcedJudg[key];
          this.forced[key] = 1;
        }
      });
    }
  }

  restart = () => {
    if (!this.tween) {
      return;
    }
    this.startMoment = this.moment;
    this.startFrame = ticker.frame;
    this.tween.reverse = this.reverse;
    this.tween.reverseStartTime = this.startMoment;
    this.play();
  }

  start = () => {
    this.updateAnim = null;
    const props = this.props;
    if (props.animation && Object.keys(props.animation).length) {
      this.tween = new Tween(this.dom, dataToArray(props.animation),
        { attr: props.attr });
      // 预先注册 raf, 初始动画数值。
      this.raf();
      // 开始动画
      this.play();
    }
  }

  play = () => {
    this.cancelRequestAnimationFrame();
    if (this.paused) {
      return;
    }
    this.rafID = ticker.add(this.raf);
  }

  updateAnimFunc = () => {
    this.cancelRequestAnimationFrame();
    this.startFrame = ticker.frame;
    if (this.updateAnim === 'update') {
      if (this.props.resetStyleBool && this.tween) {
        this.tween.resetDefaultStyle();
      }
      this.startMoment = 0;
    }
  }

  frame = () => {
    const { yoyo } = this.props;
    let { repeat } = this.props;
    const totalTime = repeat === -1 ? Number.MAX_VALUE : this.tween.totalTime * (repeat + 1);
    repeat = repeat >= 0 ? repeat : Number.MAX_VALUE;
    let moment = (ticker.frame - this.startFrame) * perFrame + this.startMoment;
    if (this.reverse) {
      moment = (this.startMoment || 0) - (ticker.frame - this.startFrame) * perFrame;
    }
    moment = moment > totalTime ? totalTime : moment;
    moment = moment <= 0 ? 0 : moment;
    let repeatNum = Math.floor(moment / this.tween.totalTime);
    repeatNum = repeatNum > repeat ? repeat : repeatNum;
    let tweenMoment = moment - this.tween.totalTime * repeatNum;
    tweenMoment = tweenMoment < perFrame ? 0 : tweenMoment;
    if (repeat && moment && moment - this.tween.totalTime * repeatNum < perFrame) {
      // 在重置样式之前补 complete；
      this.tween.frame(this.tween.totalTime * repeatNum);
    }
    if (moment < this.moment && !this.reverse ||
      repeat !== 0 && repeatNum && tweenMoment <= perFrame
    ) {
      this.tween.resetDefaultStyle();
    }
    const yoyoReverse = yoyo && repeatNum % 2;
    if (yoyoReverse) {
      tweenMoment = this.tween.totalTime - tweenMoment;
    }
    this.tween.onChange = (e) => {
      const cb = {
        ...e,
        timelineMode: '',
      };
      if (
        (!moment && !this.reverse) ||
        (this.reverse && this.moment === this.startMoment)
      ) {
        cb.timelineMode = 'onTimelineStart';
      } else if (
        moment >= totalTime && !this.reverse ||
        !moment && this.reverse
      ) {
        cb.timelineMode = 'onTimelineComplete';
      } else if (repeatNum !== this.timelineRepeatNum) {
        cb.timelineMode = 'onTimelineRepeat';
      } else {
        cb.timelineMode = 'onTimelineUpdate';
      }
      this.props.onChange(cb);
    };
    this.tween.frame(tweenMoment);
    this.moment = moment;
    this.timelineRepeatNum = repeatNum;
  }

  raf = () => {
    const { repeat, style } = this.props;
    const totalTime = repeat === -1 ? Number.MAX_VALUE : this.tween.totalTime * (repeat + 1);
    /**
      * 踩坑：frame 在前面，所以 onComplete 在 updateAnim 前调用，
      * 如果在 onComplete 改变样式，将会把 updateAnim 值更改，导到此处调用。
      * 事件需在当前帧频之前全部被处理完成, 如果在帧上改变了动画参数，直接退出并重新开始
      * 提到 this.frame 之上；
      * link: https://github.com/ant-design/ant-motion/issues/165
      */
    if (this.updateAnim) {
      this.cancelRequestAnimationFrame();
      if (this.updateStartStyle) {
        this.tween.reStart(style);
      }
      this.updateAnimFunc();
      this.start();
      return null;
    }
    this.frame();
    if ((this.moment >= totalTime && !this.reverse)
      || this.paused || (this.reverse && this.moment === 0)
    ) {
      return this.cancelRequestAnimationFrame();
    }
    return null;
  }

  cancelRequestAnimationFrame = () => {
    ticker.clear(this.rafID);
    this.rafID = -1;
  }

  render() {
    const props = { ...this.props };
    [
      'animation',
      'component',
      'componentProps',
      'reverseDelay',
      'attr',
      'paused',
      'reverse',
      'repeat',
      'yoyo',
      'moment',
      'resetStyleBool',
      'updateReStart',
      'forcedJudg',
    ].forEach(key => delete props[key]);
    props.style = { ...this.props.style };
    Object.keys(props.style).forEach(p => {
      if (p.match(/filter/i)) {
        ['Webkit', 'Moz', 'Ms', 'ms'].forEach(prefix => {
          props.style[`${prefix}Filter`] = props.style[p];
        });
      }
    });
    // component 为空时调用子级的。。
    if (!this.props.component) {
      if (!this.props.children) {
        return this.props.children;
      }
      const childrenProps = this.props.children.props;
      const { style, className } = childrenProps;
      // 合并 style 与 className。
      const newStyle = { ...style, ...props.style };
      const newClassName = props.className ? `${props.className} ${className}` : className;
      return React.cloneElement(this.props.children, { style: newStyle, className: newClassName });
    }
    return React.createElement(this.props.component, { ...props, ...this.props.componentProps });
  }
}
TweenOne.isTweenOne = true;
export default TweenOne;
