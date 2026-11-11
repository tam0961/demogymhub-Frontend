import { Link } from 'react-router-dom'

export default function Forbidden() {
  return (
    <div className="login-page">
      <div className="error-page">
        <div className="code display">403</div>
        <h1>Không đủ quyền truy cập</h1>
        <p>Liên hệ chủ phòng để được cấp quyền.</p>
        <Link className="btn btn-primary" to="/">Về trang Hôm nay</Link>
      </div>
    </div>
  )
}
