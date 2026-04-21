import requests
import hashlib
import re
import time
import json

# ================= 配置区域 =================
# 服务器地址 (请修改为您部署的服务器IP或域名)
SERVER_URL = "http://localhost:3000"

# 访问密码 (如果在服务器上配置了 ACCESS_PASSWORD，请在此填写)
ACCESS_PASSWORD = ""

# 邮箱账户 ID (在网页端查看账户列表时可以看到 ID)
ACCOUNT_ID = 1

# 邮箱文件夹 (通常验证码在收件箱 INBOX，如果找不到试一下 Junk)
MAILBOX = "INBOX"
# ===========================================

def get_auth_header():
    """生成认证头"""
    if not ACCESS_PASSWORD:
        return {}
    
    # 计算 SHA256
    token = hashlib.sha256(ACCESS_PASSWORD.encode('utf-8')).hexdigest()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

def fetch_latest_code():
    """获取最新邮件中的验证码"""
    url = f"{SERVER_URL}/api/mails/fetch-new"
    payload = {
        "account_id": ACCOUNT_ID,
        "mailbox": MAILBOX
    }
    
    try:
        print(f"正在尝试从 {SERVER_URL} 获取最新邮件...")
        response = requests.post(url, json=payload, headers=get_auth_header(), timeout=30)
        
        if response.status_code != 200:
            print(f"请求失败: {response.status_code} - {response.text}")
            return None
            
        data = response.json()
        
        # 检查业务状态码
        if data.get("code") != 200:
            print(f"API 错误: {data.get('message')}")
            return None
        
        mail = data.get("data")
        if not mail:
            print("没有获取到新邮件")
            return None
            
        # 打印邮件主题，确认是正确的邮件
        print(f"获取到邮件: {mail.get('subject')}")
        
        # 获取邮件内容
        content = mail.get("text_content") or mail.get("html_content") or ""
        
        # 使用正则提取 6 位数字验证码
        # 这是针对 OpenAI/ChatGPT 常见验证码格式的正则
        # 您可以根据实际情况调整正则表达式
        verification_code = None
        
        # 常见的验证码模式
        patterns = [
            r'\b(\d{6})\b',  # 独立的6位数字
            r'code is:?\s*(\d{6})', # "code is 123456"
            r'verification code:?\s*(\d{6})' # "verification code: 123456"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                verification_code = match.group(1)
                break
        
        if verification_code:
            print(f"成功提取验证码: {verification_code}")
            return verification_code
        else:
            print("未能在邮件中找到符合格式的验证码")
            return None
            
    except Exception as e:
        print(f"发生异常: {e}")
        return None

if __name__ == "__main__":
    # 测试运行
    code = fetch_latest_code()
    if code:
        print(f"✅ 最终结果: {code}")
    else:
        print("❌ 获取失败")
