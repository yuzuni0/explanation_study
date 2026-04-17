'use client'
import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react'

//ストロークを保存するキャンバスの実装
type Point = {
  x: number
  y: number
}

type Props = {
  style?: React.CSSProperties
}

type Stroke = Point[]
type StrokeData = Stroke[]

type StrokeCanvasHandle = {
  getStrokes: () => StrokeData
  clearStrokes: () => void
}

const StrokeCanvas = forwardRef<StrokeCanvasHandle, Props>((props, ref) => {

  const { style } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);//canvas要素の参照を持つ
  const strokes = useRef<StrokeData>([]);//完成した過去のストロークデータを保存する
  const currentStroke = useRef<Stroke | null>(null);//入力中のストロークデータを保持する

  //追加した点を線で結ぶための関数
  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke, canvas: HTMLCanvasElement): void => {
    if (stroke.length < 2) return;//点が1つしかないなら描画しない

    ctx.beginPath();//描画開始の宣言
    ctx.moveTo(stroke[0].x * canvas.offsetWidth, stroke[0].y * canvas.offsetHeight)
    for (let i = 1; i < stroke.length; i++) {
      //入力した点を線で結ぶ
      ctx.lineTo(stroke[i].x * canvas.offsetWidth, stroke[i].y * canvas.offsetHeight)
    }
    ctx.stroke();//線を描画する
  }, []);

  //キャンバスに描画するための関数
  const redraw = useCallback((): void => {
    //キャンバスを削除し、必要なストロークを描画する
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);//キャンバスをクリアする

    for (const stroke of strokes.current) {
      //過去のストロークを描画する
      drawStroke(ctx, stroke, canvas);
    }

    if (currentStroke.current !== null) {
      //入力中のストロークがあれば、描画する
      drawStroke(ctx, currentStroke.current, canvas);
    }

  }, [drawStroke])


  useImperativeHandle(ref, () => ({
    //外部に公開する関数の定義
    getStrokes: () => strokes.current,
    clearStrokes: () => {
      strokes.current = [];
      currentStroke.current = null;
      redraw();
    }
  }))


  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    //キャンバスの位置を取得する
    function getPoint(
      e: MouseEvent | TouchEvent,//マウスイベントかタッチイベントから相対座標を取得する
      canvas: HTMLCanvasElement
    ): Point {
      //相対座標を取得
      const clientX = e instanceof TouchEvent
        ? e.touches[0].clientX
        : e.clientX;
      const clientY = e instanceof TouchEvent
        ? e.touches[0].clientY
        : e.clientY;
      const rect = canvas.getBoundingClientRect();
      const absX = clientX - rect.left;
      const absY = clientY - rect.top;
      return { x: absX / rect.width, y: absY / rect.height };
    }


    //線を書いた時の流れ
    function startDraw(point: Point): void {
      currentStroke.current = [point];
    }

    function continueDraw(point: Point): void {
      if (currentStroke.current === null) return;
      currentStroke.current.push(point);//入力中のストロークが有るならその位置に点を追加する
      redraw();
    }

    function endDraw(): void {
      if (currentStroke.current === null) return;
      strokes.current.push(currentStroke.current)//完成したストロークを保存する
      currentStroke.current = null;
      redraw();
    }

    //イベントハンドラの定義
    function handleMouseDown(e: MouseEvent): void {
      //マウスでcanvasを押した時に呼ばれる
      const canvas = canvasRef.current;
      if (canvas === null) return;
      startDraw(getPoint(e, canvas));//現在地の座標を渡す
    }

    function handleMouseMove(e: MouseEvent): void {
      //マウスがcanvas内で動いた時に呼ばれる
      const canvas = canvasRef.current;
      if (canvas === null) return;
      continueDraw(getPoint(e, canvas));
    }

    function handleMouseUp(): void {
      //クリック状態を外したら描画を中断する
      endDraw();
    }

    function handleMouseLeave(): void {
      //canvasの外に出た際に描画を中断する
      endDraw();
    }

    function handleTouchStart(e: TouchEvent): void {
      //タッチでcanvasに触れた時(タブレットとか)
      e.preventDefault();
      const canvas = canvasRef.current;
      if (canvas === null) return;
      startDraw(getPoint(e, canvas));
    }

    function handleTouchMove(e: TouchEvent): void {
      //指がcanvas内で動いた時
      const canvas = canvasRef.current;
      if (canvas === null) return;
      continueDraw(getPoint(e, canvas));
    }

    function handleTouchEnd(): void {
      //指をcanvasから離した時に描画を中断する
      endDraw();
    }

    function handleTouchCancel(): void {
      //外部要因によって入力がキャンセルされた時に描画を中断する
      endDraw();
    }

    //キャンバスの解像度を上げる
    const dpr = window.devicePixelRatio || 1;

    //キャンバスのサイズを調節する
    const cssWidth = canvas.offsetWidth;
    const cssHeight = canvas.offsetHeight;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;

    //描画のスケールを調整する
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    canvas.style.touchAction = 'none';//タッチ操作でスクロールしないようにする

    //イベントリスナーの登録
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchCancel);


    const observer = new ResizeObserver(() => {
      //useRef.currentを取得し直す
      const canvas = canvasRef.current;
      if (canvas === null) return;
      //サイズを再度取得して、設定する
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.offsetWidth;
      const cssHeight = canvas.offsetHeight;

      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;

      //描画スケール(ctx)の再取得
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
      redraw();
    });
    //キャンバスのサイズ変更を監視する
    observer.observe(canvas);

    //オブザーバーの監視を終了する
    return () => {
      //クリーンアップ
      observer.disconnect();
      //イベントリスナーの削除
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchCancel);
    }

  }, [redraw, drawStroke])//[]で一回だけ実行

  return <canvas ref={canvasRef} style={style} />//キャンバスの表示
})

StrokeCanvas.displayName = 'StrokeCanvas';
export default StrokeCanvas;
export type { StrokeCanvasHandle, StrokeData };
