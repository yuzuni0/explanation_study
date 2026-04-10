'use client'
import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'

//ストロークを保存するキャンバスの実装
type Point = {
  x: number
  y: number
}

type Stroke = Point[]
type StrokeData = Stroke[]

type StrokeCanvasHandle = {
  getStrokes: () => StrokeData
  clearStrokes: () => void
}

const StrokeCanvas = forwardRef<StrokeCanvasHandle, object>((props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);//canvas要素の参照を持つ
  const strokes = useRef<StrokeData>([]);//完成した過去のストロークデータを保存する
  const currentStroke = useRef<Stroke | null>(null);//入力中のストロークデータを保持する


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

  //追加した点を線で結ぶための関数
  function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, canvas: HTMLCanvasElement): void {
    if (stroke.length < 2) return;//点が1つしかないなら描画しない

    ctx.beginPath();//描画開始の宣言
    ctx.moveTo(stroke[0].x * canvas.width, stroke[0].y * canvas.height);
    for (let i = 1; i < stroke.length; i++) {
      //入力した点を線で結ぶ
      ctx.lineTo(stroke[i].x * canvas.width, stroke[i].y * canvas.height);
    }
    ctx.stroke();//線を描画する
  }

  //キャンバスに描画するための関数
  const redraw = (): void => {
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

    return () => {
      //イベントリスナーの解除
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchCancel);
    }
  }, [])//[]で一回だけ実行


  function getStrokes(): StrokeData {
    return strokes.current;
  }

  function clearStrokes(): void {
    strokes.current = [];
    currentStroke.current = null;
    redraw();
  }

  return (<canvas ref={canvasRef} />)//StrokeCanvasの末尾に置いといて
})

StrokeCanvas.displayName = 'StrokeCanvas';
export default StrokeCanvas;