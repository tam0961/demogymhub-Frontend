import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="login-page">
      <div className="error-page">
        <div className="code display">404</div>
        <h1>Không tìm thấy trang</h1>
        <p>Đường dẫn không tồn tại.</p>
        <Link className="btn btn-primary" to="/">Về trang Hôm nay</Link>
      </div>
    </div>
  )
}
